import * as splToken from '@solana/spl-token';
import * as web3 from '@solana/web3.js';
import { seeds } from './constants';
import { WalletInterface } from './wallets';
import { DispatchConnection, DispatchConnectionOpts } from './connection';
import { compress, decompress } from './compress';
import * as idlTypes from '../lib/target/types/postbox';


// TODO(mfasman): Should we have PostNode be a base class and both Postbox
// and Post extend it? This might play nicer with a tree structure.

export type PostboxOpts = DispatchConnectionOpts;

export type PostboxSubject = {
  key: web3.PublicKey;
  str?: string;
};

export type EpochSeconds = number;

export type InputPostData = {
  subj?: string;
  body: string;
  meta?: object;
  replyTo?: web3.PublicKey;
};

export type PostData = InputPostData & {
  ts: Date;
};

type ChainPostdata = {
  s?: string;
  b?: string;
  m?: object;
  r?: string;
  t?: EpochSeconds;
};

export type PostNode = Post | Postbox;

export type Post = {
  parent: PostNode;
  address: web3.PublicKey;
  poster: web3.PublicKey;
  data: PostData;
  upVotes: number;
  downVotes: number;
  postId: number;
};

type ChainPost = {
  poster: web3.PublicKey;
  data: Buffer;
  upVotes: number;
  downVotes: number;
};

type NullableChainPost = null | ChainPost;

type ChainPostboxInfo = {
  maxChildId: number;
  moderatorMint: web3.PublicKey;
  settingsAccounts: any;
};

export class Postbox extends DispatchConnection {
  private _address: web3.PublicKey | undefined;

  constructor(
    public conn: web3.Connection,
    public wallet: WalletInterface,
    public subject: PostboxSubject,
    opts?: PostboxOpts,
    ) {
    super(conn, wallet, opts);
  }

  // Init functions
  async initialize(owners?: web3.PublicKey[]): Promise<web3.TransactionSignature> {
    const ix = await this.postboxProgram.methods
      .initialize(this.subject.str ?? "", owners ?? [this.wallet.publicKey!])
      .accounts({
        signer: this.wallet.publicKey!,
        subjectAccount: this.subject.key,
        treasury: this.addresses.treasuryAddress,
      })
      .transaction();
    return this.sendTransaction(ix);
  }

  // Basic commands
  async createPost(input: InputPostData): Promise<web3.TransactionSignature> {
    // TODO(mfasman): make this be a better allocation algorithm
    const growBy = 1; // TODO(mfasman): pull from the IDL
    const maxId = (await this.getChainPostboxInfo()).maxChildId;
    const addresses = await this.getAddresses(maxId, Math.max(0, maxId - growBy));
    const infos = await this.conn.getMultipleAccountsInfo(addresses);
    const data = await this.postDataToBuffer(input);
    const ix = await this.postboxProgram.methods
      .createPost(data, maxId)
      .accounts({
        postbox: await this.getAddress(),
        poster: this.wallet.publicKey!,
        treasury: this.addresses.treasuryAddress,
      })
      .transaction();
    return this.sendTransaction(ix);
  }

  async deletePost(post: Post): Promise<web3.TransactionSignature> {
    const ix = await this.postboxProgram.methods
      .deleteOwnPost(post.postId)
      .accounts({
        postbox: await this.getAddress(),
        post: post.address,
      })
      .transaction();
    return this.sendTransaction(ix);
  }

  async deletePostAsModerator(post: Post): Promise<web3.TransactionSignature> {
    const moderatorMint = (await this.getChainPostboxInfo()).moderatorMint;
    const ata = await splToken.getAssociatedTokenAddress(moderatorMint, this.wallet.publicKey!);
    const ix = await this.postboxProgram.methods
      .deletePostByModerator(post.postId)
      .accounts({
        postbox: await this.getAddress(),
        post: post.address,
        poster: post.poster,
        moderatorTokenAta: ata,
      })
      .transaction();
    return this.sendTransaction(ix);
  }

  async replyToPost(post: Post, input: InputPostData): Promise<web3.TransactionSignature> {
    const postData = input as PostData;
    postData.replyTo = post.address;
    return this.createPost(postData);
  }

  async vote(post: Post, up: boolean): Promise<web3.TransactionSignature> {
    const ix = await this.postboxProgram.methods
      .vote(post.postId, up)
      .accounts({
        postbox: await this.getAddress(),
        post: post.address,
        treasury: this.addresses.treasuryAddress,
      })
      .transaction();
    return this.sendTransaction(ix);
  }

  // Fetching functions
  async innerFetchPosts(parent: PostNode, maxChildId: number): Promise<Post[]> {
    if (maxChildId === 0) return [];
    const addresses = await this.getAddresses(maxChildId);
    const chainPosts = await this.postboxProgram.account.post.fetchMultiple(addresses) as NullableChainPost[];
    const convertedPosts = await Promise.all(chainPosts.map((rp, i) => {
      return this.convertChainPost(rp, addresses[i], parent, i);
    }));
    return convertedPosts.filter((p): p is Post => p !== null);
  }

  async fetchAllPosts(): Promise<Post[]> {
    const info = await this.getChainPostboxInfo();
    return this.innerFetchPosts(this, info.maxChildId);
  }

  async fetchPosts(): Promise<Post[]> {
    return (await this.fetchAllPosts()).filter((p) => !p.data.replyTo);
  }

  async fetchReplies(post: Post): Promise<Post[]> {
    return (await this.fetchAllPosts()).filter((p) => p.data.replyTo && p.data.replyTo.equals(post.address));
  }

  // Admin functions
  async addModerator(newModerator: web3.PublicKey): Promise<web3.TransactionSignature> {
    const info = await this.getChainPostboxInfo();
    const ownerSettings = await this.getSettingsAddress(info, "ownerInfo");
    const ata = await splToken.getAssociatedTokenAddress(info.moderatorMint, newModerator);
    const ix = await this.postboxProgram.methods
      .designateModerator(this.subject.str ?? "")
      .accounts({
        postbox: await this.getAddress(),
        subjectAccount: this.subject.key,
        newModerator: newModerator,
        ownerSettings,
        moderatorAta: ata,
      })
      .transaction();
    return this.sendTransaction(ix);
  }

  // Chain functions
  async getAddress(): Promise<web3.PublicKey> {
    if (!this._address) {
      const [postAddress] = await web3.PublicKey.findProgramAddress(
        [seeds.protocolSeed, seeds.postboxSeed, this.subject.key.toBuffer(), Buffer.from(this.subject.str ?? "")],
        this.postboxProgram.programId,
      );
      this._address = postAddress;
    }
    return this._address;
  }

  // TODO(mfasman): make the parent a PostNode that is passed in
  async getPostAddress(postId: number): Promise<web3.PublicKey> {
    const postboxAddress = await this.getAddress();
    const msgCountBuf = Buffer.allocUnsafe(4);
    msgCountBuf.writeInt32LE(postId);
    const [postAddress] = await web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.postSeed, postboxAddress.toBuffer(), msgCountBuf],
      this.postboxProgram.programId,
    );
    return postAddress;
  }

  async getAddresses(maxPostId: number, startPostId?: number): Promise<web3.PublicKey[]> {
    if ((startPostId ?? 0) > maxPostId) {
      return [];
    }
    const postIds = Array(1 + maxPostId - (startPostId ?? 0))
      .fill(0)
      .map((_element, index) => index);
    const addresses = await Promise.all(postIds.map((id) => this.getPostAddress(id)));
    return addresses;
  }

  async getChainPostboxInfo(): Promise<ChainPostboxInfo> {
    return this.postboxProgram.account.postbox.fetch(await this.getAddress());
  }

  async convertChainPost(chainPost: NullableChainPost, address: web3.PublicKey, parent: PostNode, postId: number): Promise<Post | null> {
    if (!chainPost) return null;
    const data = await this.bufferToPostData(chainPost.data);
    return {
      parent,
      address,
      poster: chainPost.poster,
      data,
      upVotes: chainPost.upVotes,
      downVotes: chainPost.downVotes,
      postId,
    };
  }

  // Utility functions
  async getSettingsAddress(info: ChainPostboxInfo, settingsType: string): Promise<web3.PublicKey | undefined> {
    for (const setting of info.settingsAccounts as any[]) {
      if (settingsType in setting.settingsType) {
        return setting.address;
      }
    }
    return undefined;
  }

  async postDataToBuffer(postData: InputPostData): Promise<Buffer> {
    const pd: ChainPostdata = {
      s: postData.subj,
      b: postData.body,
      m: postData.meta,
      r: postData.replyTo?.toBase58(),
      t: Math.floor(new Date().getTime() / 1000),
    };
    const dataString = JSON.stringify(pd);
    return compress(dataString);
  }

  async bufferToPostData(input: Buffer): Promise<PostData> {
    const dataString = (await decompress(input)).toString();
    const postData = JSON.parse(dataString) as ChainPostdata;
    return {
      subj: postData.s,
      body: postData.b ?? '',
      ts: new Date((postData.t?? 0) * 1000),
      replyTo: postData.r ? new web3.PublicKey(postData.r) : undefined,
      meta: postData.m,
    };
  }
}

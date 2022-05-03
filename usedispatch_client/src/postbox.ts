import * as splToken from '@solana/spl-token';
import * as web3 from '@solana/web3.js';
import { seeds } from './constants';
import { WalletInterface } from './wallets';
import { DispatchConnection, DispatchConnectionOpts } from './connection';
import { gzip, ungzip } from 'node-gzip';


// TODO(mfasman): Should we have PostNode be a base class and both Postbox
// and Post extend it? This might play nicer with a tree structure.

export type PostboxOpts = DispatchConnectionOpts;

export type PostboxSubject = web3.PublicKey;

export type EpochSeconds = number;

export type InputPostData = {
  subj?: string;
  body: string;
};

export type PostData = InputPostData & {
  ts: Date;
};

type ChainPostdata = {
  subj?: string;
  body?: string;
  ts?: EpochSeconds;
};

export type PostNode = Post | Postbox;

export type Post = {
  parent: PostNode;
  address: web3.PublicKey;
  poster: web3.PublicKey;
  data: PostData;
  _maxReplyId: number;
};

type ChainPost = {
  poster: web3.PublicKey;
  data: Buffer;
  maxChildId?: number; // Search up to this index
};

type NullableChainPost = null | ChainPost;

type ChainPostboxInfo = {
  maxChildId: number;
  moderatorMint: web3.PublicKey;
  // ownerInfoAccount: web3.PublicKey;
  // postRestrictionsAccount: web3.PublicKey;
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
  async initialize(): Promise<web3.TransactionSignature> {
    const ix = await this.postboxProgram.methods
      .initialize()
      .accounts({
        owner: this.wallet.publicKey!,
      })
      .transaction();
    return this.sendTransaction(ix);
  }

  // Basic functions
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
      })
      .transaction();
    return this.sendTransaction(ix);
  }

  async deletePost(post: Post): Promise<web3.TransactionSignature> {
    const ix = await this.postboxProgram.methods
      .deleteOwnPost()
      .accounts({
        post: post.address,
      })
      .transaction();
    return this.sendTransaction(ix);
  }

  async deletePostAsModerator(post: Post): Promise<web3.TransactionSignature> {
    const ix = await this.postboxProgram.methods
      .deletePostByModerator()
      .accounts({
        post: post.address,
      })
      .transaction();
    return this.sendTransaction(ix);
  }

  // async replyToPost(post: Post, input: InputPostData): Promise<web3.TransactionSignature> {
  //   const data = await this.postDataToBuffer(input);
  //   const ix = await this.postboxProgram.methods
  //     .createReply(data)
  //     .accounts({
  //       replyToPost: post.address,
  //     })
  //     .transaction();
  //   return this.sendTransaction(ix);
  // }

  async innerFetchPosts(parent: PostNode, maxChildId: number): Promise<Post[]> {
    if (maxChildId === 0) return [];
    const addresses = await this.getAddresses(maxChildId);
    const chainPosts = await this.postboxProgram.account.post.fetchMultiple(addresses) as NullableChainPost[];
    const convertedPosts = await Promise.all(chainPosts.map((rp, i) => {
      return this.convertChainPost(rp, addresses[i], parent);
    }));
    return convertedPosts.filter((p): p is Post => p !== null);
  }

  async fetchPosts(): Promise<Post[]> {
    const info = await this.getChainPostboxInfo();
    return this.innerFetchPosts(this, info.maxChildId);
  }

  async fetchReplies(post: Post): Promise<Post[]> {
    return this.innerFetchPosts(post, post._maxReplyId);
  }

  // Admin functions
  async addModerator(newModerator: web3.PublicKey): Promise<web3.TransactionSignature> {
    const info = await this.getChainPostboxInfo();
    const moderatorMint = info.moderatorMint;
    const ata = await splToken.getAssociatedTokenAddress(moderatorMint, newModerator);
    const ataAccountInfo = await this.conn.getAccountInfo(ata);
    const tx = new web3.Transaction();

    if (ataAccountInfo) {
      const tokenAccount = await splToken.getAccount(this.conn, ata);
      if (tokenAccount.amount > 0) {
        throw new Error(`${newModerator.toBase58()} is already a moderator.`);
      }
    } else {
      tx.add(splToken.createAssociatedTokenAccountInstruction(
        this.wallet.publicKey!, ata, newModerator, moderatorMint
      ));
    }
    tx.add(splToken.createMintToInstruction(moderatorMint, ata, this.wallet.publicKey!, 1));
    return this.sendTransaction(tx);
  }

  // Chain functions
  async getAddress(): Promise<web3.PublicKey> {
    if (!this._address) {
      const [postAddress] = await web3.PublicKey.findProgramAddress(
        [seeds.protocolSeed, seeds.postboxSeed, this.subject.toBuffer()],
        this.postboxProgram.programId,
      );
      this._address = postAddress;
    }
    return this._address;
  }

  // TODO(mfasman): make the parent a PostNode that is passed in
  async getPostAddress(postId: number): Promise<web3.PublicKey> {
    const parentAddress = await this.getAddress();
    const msgCountBuf = Buffer.allocUnsafe(4);
    msgCountBuf.writeInt32LE(postId);
    const [postAddress] = await web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.postSeed, parentAddress.toBuffer(), msgCountBuf],
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

  async convertChainPost(chainPost: NullableChainPost, address: web3.PublicKey, parent: PostNode): Promise<Post | null> {
    if (!chainPost) return null;
    const data = await this.bufferToPostData(chainPost.data);
    return {
      parent,
      address,
      poster: chainPost.poster,
      data,
      _maxReplyId: chainPost.maxChildId ?? 0,
    };
  }

  // Utility functions
  async postDataToBuffer(input: InputPostData): Promise<Buffer> {
    const postData = input as ChainPostdata;
    postData.ts = new Date().getTime() / 1000;
    const dataString = JSON.stringify(postData);
    return gzip(dataString);
  }

  async bufferToPostData(input: Buffer): Promise<PostData> {
    const dataString = (await ungzip(input)).toString();
    const postData = JSON.parse(dataString) as ChainPostdata;
    return {
      subj: postData.subj,
      body: postData.body ?? '',
      ts: new Date((postData.ts ?? 0) * 1000),
    };
  }
}

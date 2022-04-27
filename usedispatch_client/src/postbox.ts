import * as web3 from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { seeds, eventName } from './constants';
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
  data: PostData;
  maxChildId?: number; // Search up to this index
};

type ChainPostboxInfo = {
  maxChildId: number;
  moderatorMint: web3.PublicKey;
  ownerInfoAccount: web3.PublicKey;
  postRestrictionsAccount: web3.PublicKey;
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

  // Basic functions
  async createPost(input: InputPostData): Promise<web3.TransactionSignature> {
    const data = await this.postDataToBuffer(input);
    const ix = await this.program.methods
      .createPost(data)
      .accounts({})
      .transaction();
    return this.sendTransaction(ix);
  }

  async deletePost(post: Post): Promise<web3.TransactionSignature> {
    const ix = await this.program.methods
      .deletePost()
      .accounts({
        postToDelete: post.address,
      })
      .transaction();
    return this.sendTransaction(ix);
  }

  async replyToPost(post: Post, input: InputPostData): Promise<web3.TransactionSignature> {}

  async fetchPosts(): Promise<Post[]> {
    const info = await this.getChainPostboxInfo();
    const addresses = this.getAddresses(this, info.maxChildId);
    const rawPosts = await this.program.account.post.fetchMultiple(addresses) as ChainPost[];
    //TODO(mfasman): make this next line combine address, etc.
    return rawPosts.map(this.convertChainPost).filter((p): p is Post => p !== null);
  }

  async fetchReplies(post: Post): Promise<Post[]> {}

  // Admin functions
  async addModerator(): Promise<web3.TransactionSignature> {}

  // Chain functions
  get address(): web3.PublicKey {
    if (!this._address) {
      // TODO(mfasman): implement
    }
    return this._address!;
  }

  async getPostAddress(parent: PostNode, postId: number): Promise<web3.PublicKey> {
    const msgCountBuf = Buffer.allocUnsafe(4);
    msgCountBuf.writeInt32LE(postId);
    const [postAddress] = await web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.postSeed, parent.address.toBuffer(), msgCountBuf],
      this.program.programId,
    );
    return postAddress;
  }

  async getAddresses(parent: PostNode, maxPostId: number): Promise<web3.PublicKey[]> {
    if (0 === maxPostId) {
      return [];
    }
    const messageIds = Array(maxPostId)
      .fill(0)
      .map((_element, index) => index);
    const addresses = await Promise.all(messageIds.map((id) => this.getPostAddress(parent, id)));
    return addresses;
  }

  async getChainPostboxInfo(): Promise<ChainPostboxInfo> {
    return this.program.account.postbox.fetch(this.address);
  }

  convertChainPost(chainPost: ChainPost): Post {}

  // Utility functions
  async postDataToBuffer(input: InputPostData): Promise<Buffer> {
    const postData = input as ChainPostdata;
    postData.ts = new Date().getTime() / 1000;
    const dataString = JSON.stringify(postData);
    const data = await gzip(dataString);
    return data;
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

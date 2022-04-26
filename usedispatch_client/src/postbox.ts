import * as web3 from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { seeds, eventName } from './constants';
import { WalletInterface } from './wallets';
import { DispatchConnection, DispatchConnectionOpts } from './connection';

export type PostboxOpts = DispatchConnectionOpts;

export type PostboxSubject = web3.PublicKey;

export type PostData = {
  ts: number;
  subj?: string;
  body: string;
};

type ChainPost = {
  poster: web3.PublicKey;
  data: PostData;
  maxChildPost?: number; // Search up to this index
};

export type Post = {
  poster: web3.PublicKey;
  data: PostData;
  address: web3.PublicKey;
  _maxReplyId: number;
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
  async createPost() {}

  async deletePost() {}

  async replyToPost() {}

  async fetchPosts() {}

  async fetchReplies() {}

  // Admin functions
  async addModerator() {}

  // Utility functions
  get address(): web3.PublicKey {
    if (!this._address) {
      // TODO(mfasman): implement
    }
    return this._address!;
  }
}

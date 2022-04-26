import * as web3 from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { seeds, eventName } from './constants';
import { WalletInterface } from './wallets';
import { DispatchConnection, DispatchConnectionOpts } from './connection';

export type PostboxOpts = DispatchConnectionOpts;

export type PostData = {
  ts: number;
  subj?: string;
  body: string;
};

type ChainPost = {
  poster: web3.PublicKey;
  data: PostData;
  maxChildPost?: number; // Search up to this index
}

export class Post {
  constructor(
    public postbox: Postbox,
    public poster: web3.PublicKey,
    public data: PostData,
    private maxChildPost: number,
    ) {}

  // TODO(mfasman): implement
  async getReplies(): Promise<Post[]> {
    return [];
  }
}

export class Postbox extends DispatchConnection {
  constructor(public conn: web3.Connection, public wallet: WalletInterface, opts?: PostboxOpts) {
    super(conn, wallet, { skipAnchorProvider: opts?.skipAnchorProvider, cluster: opts?.cluster });
  }

  // Basic functions
  async createPost() {}

  async deletePost() {}

  async replyToPost() {}

  async fetchPosts() {}

  // Admin functions
  async addModerator() {}
}

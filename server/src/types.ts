import { PublicKey } from '@solana/web3.js';

export enum ActionKind {
  CreateForum,
  GetServerPubkey
}

export interface CreateForumAction {
  kind: ActionKind.CreateForum;
  // base58 encoded
  userPubkeyBase58: string;
  // the transaction that funded this forum creation
  txid: string;
  // the identifier for the new postbox
  identifier: string
}

export interface GetServerPubkeyAction {
  kind: ActionKind.GetServerPubkey
}

export type EndpointParameters
  = CreateForumAction
  | GetServerPubkeyAction;

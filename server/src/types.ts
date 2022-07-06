import { PublicKey } from '@solana/web3.js';

export enum ActionKind {
  CreateForum,
  GetServerPubkey
}

export interface CreateForumAction {
  kind: ActionKind.CreateForum;
  // base58 encoded
  userPubkeyBase58: string;
}

export interface GetServerPubkeyAction {
  kind: ActionKind.GetServerPubkey
}

export type EndpointParameters
  = CreateForumAction
  | GetServerPubkeyAction;

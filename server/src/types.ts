import { PublicKey } from '@solana/web3.js';

export type PublicKeyBase58 = string;

export enum ActionKind {
  GetServerPubkey,
    ValidateTransaction,
    SignData,
}

export interface GetServerPubkeyAction {
  kind: ActionKind.GetServerPubkey;
}

export interface ValidateTransactionAction {
  kind: ActionKind.ValidateTransaction;
  accessToken: string;
}

// TODO
export interface SignDataAction {
  kind: ActionKind.SignData;
  accessToken: string;
  data: string;
}

export type EndpointParameters
  = GetServerPubkeyAction
  | ValidateTransactionAction
  // TODO
  | SignDataAction

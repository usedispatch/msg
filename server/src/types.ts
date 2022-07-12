import { PublicKey } from '@solana/web3.js';

export type PublicKeyBase58 = string;

export enum ActionKind {
  GetServerPubkey,
    ValidateTransaction,
    SignTransaction,
}

export interface GetServerPubkeyAction {
  kind: ActionKind.GetServerPubkey;
}

export interface ValidateTransactionAction {
  kind: ActionKind.ValidateTransaction;
  accessToken: string;
}

// TODO
export interface SignTransactionAction {
  kind: ActionKind.SignTransaction;
}

export type EndpointParameters
  = GetServerPubkeyAction
  | ValidateTransactionAction
  // TODO
  | SignTransactionAction

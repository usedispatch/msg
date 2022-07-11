import { PublicKey } from '@solana/web3.js';

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
  // The user's primary wallet public key
  userKey: PublicKey;
  // The public key of the collection that is to be checked
  collectionKey: PublicKey;
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

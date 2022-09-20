import * as web3 from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';

export type WalletInterface = Pick<
  WalletContextState,
  'signTransaction' | 'signAllTransactions' | 'publicKey' | 'wallet' | 'sendTransaction'
>;

export interface SendTransactionOptions extends web3.SendOptions {
  signers?: web3.Signer[];
}

export interface AnchorNodeWalletInterface extends WalletInterface {
  payer: web3.Signer;
}

export interface AnchorExpectedWalletInterface {
  signTransaction(tx: web3.Transaction): Promise<web3.Transaction>;
  signAllTransactions(txs: web3.Transaction[]): Promise<web3.Transaction[]>;
  get publicKey(): web3.PublicKey;
}

export class KeyPairWallet {
  constructor(readonly payer: web3.Keypair) {}

  async signTransaction(tx: web3.Transaction): Promise<web3.Transaction> {
    tx.partialSign(this.payer);
    return tx;
  }

  async signAllTransactions(txs: web3.Transaction[]): Promise<web3.Transaction[]> {
    return txs.map((tx) => {
      tx.partialSign(this.payer);
      return tx;
    });
  }

  get publicKey(): web3.PublicKey {
    return this.payer.publicKey;
  }
}

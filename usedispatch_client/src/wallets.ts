import * as web3 from '@solana/web3.js';
import { WalletAdapterProps } from '@solana/wallet-adapter-base';

export interface AnchorExpectedWalletInterface {
  signTransaction(tx: web3.Transaction): Promise<web3.Transaction>;
  signAllTransactions(txs: web3.Transaction[]): Promise<web3.Transaction[]>;
  get publicKey(): web3.PublicKey;
}

// We copy this code here so as not to depend on the react wallet-adapter
export interface WalletInterface {
  publicKey: web3.PublicKey | null;
  sendTransaction?: WalletAdapterProps['sendTransaction'];
  signTransaction?: AnchorExpectedWalletInterface['signTransaction'];
  signAllTransactions?: AnchorExpectedWalletInterface['signAllTransactions'];
}

export interface AnchorNodeWalletInterface extends WalletInterface {
  payer: web3.Signer;
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

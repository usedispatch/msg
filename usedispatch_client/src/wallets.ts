import * as web3 from '@solana/web3.js';

export interface WalletInterface {
  signTransaction(tx: web3.Transaction): Promise<web3.Transaction>;
  signAllTransactions(txs: web3.Transaction[]): Promise<web3.Transaction[]>;
  get publicKey(): web3.PublicKey;
}

export interface SendTransactionOptions extends web3.SendOptions {
  signers?: web3.Signer[];
}

export interface WalletAdapterInterface extends WalletInterface {
  sendTransaction(
    transaction: web3.Transaction,
    connection: web3.Connection,
    options?: SendTransactionOptions,
  ): Promise<web3.TransactionSignature>;
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

import * as web3 from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { Messaging } from '../../target/types/messaging';
import messagingProgramIdl from '../../target/idl/messaging.json';
import { Postbox } from '../../target/types/postbox';
import postboxProgramIdl from '../../target/idl/postbox.json';
import { clusterAddresses, defaultCluster, DispatchAddresses, TXN_COMMITMENT, SOLANA_CONNECTION_MAX_RETRIES } from './constants';
import {
  WalletInterface,
  AnchorExpectedWalletInterface,
  AnchorNodeWalletInterface,
} from './wallets';

export type DispatchConnectionOpts = {
  skipAnchorProvider?: boolean;
  cluster?: web3.Cluster;
};

export class DispatchConnection {
  public addresses: DispatchAddresses;
  public messagingProgram: anchor.Program<Messaging>;
  public postboxProgram: anchor.Program<Postbox>;

  constructor(public conn: web3.Connection, public wallet: WalletInterface, opts?: DispatchConnectionOpts) {
    if (!wallet.publicKey) {
      throw new Error('Provided wallet must have a public key defined');
    }
    this.addresses = clusterAddresses.get(opts?.cluster ?? defaultCluster)!;

    // Initialize anchor
    if (!opts?.skipAnchorProvider) {
      if (this.wallet.signTransaction && this.wallet.signAllTransactions) {
        const anchorWallet = this.wallet as AnchorExpectedWalletInterface;
        anchor.setProvider(new anchor.AnchorProvider(conn, anchorWallet, {}));
      } else {
        throw new Error('The provided wallet is unable to sign transactions');
      }
    }
    this.messagingProgram = new anchor.Program<Messaging>(messagingProgramIdl as any, this.addresses.programAddress);
    this.postboxProgram = new anchor.Program<Postbox>(postboxProgramIdl as any, this.addresses.postboxAddress);
  }

  public async sendTransaction(
    tx: web3.Transaction,
    // TODO see if there is a better default than recent
    commitment: web3.Commitment = TXN_COMMITMENT,
  ) {
    let sig: string;
    if ('sendTransaction' in this.wallet) {
      const wallet = this.wallet;
      sig = await wallet.sendTransaction(tx, this.conn, { maxRetries: SOLANA_CONNECTION_MAX_RETRIES });
    } else if ('payer' in this.wallet) {
      const wallet = this.wallet as AnchorNodeWalletInterface;
      const signer = wallet.payer;
      sig = await this.conn.sendTransaction(tx, [signer], { maxRetries: SOLANA_CONNECTION_MAX_RETRIES });
    } else {
      throw new Error('`wallet` has neither `sendTransaction` nor `payer` so cannot send transaction');
    }
    await this.conn.confirmTransaction(sig, commitment);
    return sig;
  }
}

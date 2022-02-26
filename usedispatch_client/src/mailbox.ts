import * as web3 from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { Messaging } from '../../target/types/messaging';
import messagingProgramIdl from '../../target/idl/messaging.json';
import { clusterAddresses, defaultCluster, seeds, DispatchAddresses } from './constants';
import { WalletInterface, WalletAdapterInterface, AnchorNodeWalletInterface } from './wallets';

export type MailboxAccount = {
  messageCount: number;
  readMessageCount: number;
};

export type MessageAccount = {
  sender: web3.PublicKey;
  data: string;
};

export type MailboxOpts = {
  mailboxOwner?: web3.PublicKey;
  payer?: web3.PublicKey;
  skipAnchorProvider?: boolean;
  cluster?: web3.Cluster;
}

export class Mailbox {
  public mailboxOwner: web3.PublicKey;
  public payer?: web3.PublicKey;
  public addresses: DispatchAddresses;
  public program: anchor.Program<Messaging>;

  constructor(public conn: web3.Connection, public wallet: WalletInterface, opts?: MailboxOpts) {
    this.mailboxOwner = opts?.mailboxOwner ?? wallet.publicKey;
    this.payer = opts?.payer;
    this.addresses = clusterAddresses.get(opts?.cluster ?? defaultCluster)!;
  
    // Initialize anchor
    if (!opts?.skipAnchorProvider) {
      anchor.setProvider(new anchor.Provider(conn, this.wallet, {}));
    }
    this.program = new anchor.Program<Messaging>(messagingProgramIdl as any, this.addresses.programAddress);
  }

  /*
    Porcelain commands
  */
  async send(data: string, receiverAddress: web3.PublicKey): Promise<string> {
    this.validateWallet();
    const tx = await this.makeSendTx(data, receiverAddress);
    return this.sendTransaction(tx);
  }

  async pop(): Promise<string> {
    this.validateWallet();
    const tx = await this.makePopTx();
    return this.sendTransaction(tx);
  }

  async fetch(): Promise<MessageAccount[]> {
    const mailbox = await this.fetchMailbox();
    if (!mailbox) {
      return [];
    }

    const messages: MessageAccount[] = [];
    for (let i = mailbox.readMessageCount; i < mailbox.messageCount; i++) {
      const message = await this.getMessageAddress(i);
      const messageAccount = await this.program.account.message.fetch(message);
      messages.push(messageAccount as MessageAccount);
    }

    return messages;
  }

  async count() {
    const mailbox = await this.fetchMailbox();
    if (!mailbox) {
      return 0;
    }

    return mailbox.messageCount - mailbox.readMessageCount;
  }

  async countEx() {
    const mailbox = await this.fetchMailbox();
    if (!mailbox) {
      return {
        messageCount: 0,
        readMessageCount: 0,
      };
    }

    return {
      messageCount: mailbox.messageCount,
      readMessageCount: mailbox.readMessageCount,
    };
  }

  /*
    Transaction generation commands
  */
  async makeSendTx(data: string, receiverAddress: web3.PublicKey): Promise<web3.Transaction> {
    const toMailboxAddress = await this.getMailboxAddress(receiverAddress);
    let messageIndex = 0;

    const toMailbox = await this.fetchMailbox(toMailboxAddress);
    if (toMailbox) {
      messageIndex = toMailbox.messageCount;
    }

    const messageAddress = await this.getMessageAddress(messageIndex, receiverAddress);

    const tx = this.program.transaction.sendMessage(data, {
      accounts: {
        mailbox: toMailboxAddress,
        receiver: receiverAddress,
        message: messageAddress,
        payer: this.payer ?? this.mailboxOwner,
        sender: this.mailboxOwner,
        feeReceiver: this.addresses.treasuryAddress,
        systemProgram: web3.SystemProgram.programId,
      },
    });

    return this.setTransactionPayer(tx);
  }

  async makePopTx(): Promise<web3.Transaction> {
    const mailboxAddress = await this.getMailboxAddress();
    const mailbox = await this.fetchMailbox();
    if (!mailbox) {
      throw new Error(`Mailbox ${mailboxAddress.toBase58()} not found`);
    }

    const messageAddress = await this.getMessageAddress(mailbox.readMessageCount);
    const messageAccount = await this.program.account.message.fetch(messageAddress);

    const tx = this.program.transaction.closeMessage({
      accounts: {
        mailbox: mailboxAddress,
        receiver: this.mailboxOwner,
        message: messageAddress,
        rentDestination: messageAccount.payer,
        systemProgram: web3.SystemProgram.programId,
      },
    });

    return this.setTransactionPayer(tx);
  }

  /*
    Utility functions
  */

  async getMailboxAddress(mailboxOwner?: web3.PublicKey) {
    const ownerAddress = mailboxOwner ?? this.mailboxOwner;
    const [mailboxAddress] = await web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.mailboxSeed, ownerAddress.toBuffer()],
      this.program.programId,
    );

    return mailboxAddress;
  }

  async getMessageAddress(index: number, receiverAddress?: web3.PublicKey) {
    const receiver = receiverAddress ?? this.mailboxOwner;
    const msgCountBuf = Buffer.allocUnsafe(4);
    msgCountBuf.writeInt32LE(index);
    const [messageAddress] = await web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.messageSeed, receiver.toBuffer(), msgCountBuf],
      this.program.programId,
    );

    return messageAddress;
  }

  private async fetchMailbox(mailboxAddress?: web3.PublicKey) {
    const address = mailboxAddress ?? await this.getMailboxAddress();
    const mailboxAccount = await this.program.account.mailbox.fetchNullable(address);
    return mailboxAccount;
  }

  private validateWallet() {
    if (!this.wallet.publicKey.equals(this.mailboxOwner)) {
      throw new Error('`mailboxOwner` must equal `wallet.publicKey` to send transaction');
    }
    if (this.payer && !this.payer.equals(this.mailboxOwner)) {
      throw new Error('`mailboxOwner` must equal `payer` to send transaction');
    }
  }

  private async sendTransaction(tx: web3.Transaction) {
    let sig: string;
    if ("sendTransaction" in this.wallet) {
      const wallet = this.wallet as WalletAdapterInterface;
      sig = await wallet.sendTransaction(tx, this.conn);
    } else if ("payer" in this.wallet) {
      const wallet = this.wallet as AnchorNodeWalletInterface;
      const signer = wallet.payer;
      sig = await this.conn.sendTransaction(tx, [signer]);
    } else {
      throw new Error('`wallet` has neither `sendTransaction` nor `payer` so cannot send transaction');
    }
    await this.conn.confirmTransaction(sig, 'recent');
    return sig;
  }

  private setTransactionPayer(tx: web3.Transaction): web3.Transaction {
    if (this.payer) {
      tx.feePayer = this.wallet.publicKey;
    }
    return tx;
  }
}

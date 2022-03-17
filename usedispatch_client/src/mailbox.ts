import * as web3 from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import * as CryptoJS from 'crypto-js';
import { Messaging } from '../../target/types/messaging';
import messagingProgramIdl from '../../target/idl/messaging.json';
import { clusterAddresses, defaultCluster, seeds, DispatchAddresses, eventName } from './constants';
import {
  WalletInterface,
  WalletAdapterInterface,
  AnchorNodeWalletInterface,
  AnchorExpectedWalletInterface,
} from './wallets';

export type MailboxAccount = {
  messageCount: number;
  readMessageCount: number;
};

export type MessageAccount = {
  sender: web3.PublicKey;
  data: string;
  messageId: number;
};

export type MailboxOpts = {
  mailboxOwner?: web3.PublicKey;
  payer?: web3.PublicKey;
  skipAnchorProvider?: boolean;
  cluster?: web3.Cluster;
  sendObfuscated?: boolean;
};

export class Mailbox {
  public mailboxOwner: web3.PublicKey;
  public payer?: web3.PublicKey;
  public addresses: DispatchAddresses;
  public program: anchor.Program<Messaging>;
  public obfuscate: boolean;

  constructor(public conn: web3.Connection, public wallet: WalletInterface, opts?: MailboxOpts) {
    if (!wallet.publicKey) {
      throw new Error('Provided wallet must have a public key defined');
    }
    this.mailboxOwner = opts?.mailboxOwner ?? wallet.publicKey!;
    this.payer = opts?.payer;
    this.addresses = clusterAddresses.get(opts?.cluster ?? defaultCluster)!;
    this.obfuscate = opts?.sendObfuscated ?? false;

    // Initialize anchor
    if (!opts?.skipAnchorProvider) {
      if (this.wallet.signTransaction && this.wallet.signAllTransactions) {
        const anchorWallet = this.wallet as AnchorExpectedWalletInterface;
        anchor.setProvider(new anchor.Provider(conn, anchorWallet, {}));
      } else {
        throw new Error('The provided wallet is unable to sign transactions');
      }
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
    const numMessages = mailbox.messageCount - mailbox.readMessageCount;
    if (0 === numMessages) {
      return [];
    }
    const messageIds = Array(numMessages)
      .fill(0)
      .map((_element, index) => index + mailbox.readMessageCount);
    return Promise.all(messageIds.map((id) => this.getMessageById(id)));
  }

  async getMessageById(messageId: number): Promise<MessageAccount> {
    const messageAddress = await this.getMessageAddress(messageId);
    const messageAccount = await this.program.account.message.fetch(messageAddress);
    return {
      sender: messageAccount.sender,
      payer: messageAccount.payer,
      data: this.unObfuscateMessage(messageAccount.data),
      messageId,
    } as MessageAccount;
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

    const message = this.obfuscate ? this.obfuscateMessage(data, receiverAddress) : data;

    const tx = this.program.transaction.sendMessage(message, {
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
    Subscriptions
  */

  // Reminder this is every single message on the protocol, which we filter here
  addMessageListener(callback: (message: MessageAccount) => void): number {
    return this.program.addEventListener(eventName, (event: any, _slot: number) => {
      if (event.receiverPubkey.equals(this.mailboxOwner)) {
        callback({
          sender: event.senderPubkey,
          data: this.unObfuscateMessage(event.message),
          messageId: event.messageIndex,
        });
      }
    });
  }

  removeMessageListener(subscriptionId: number) {
    this.program.removeEventListener(subscriptionId);
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
    const mailboxAddress = await this.getMailboxAddress(receiver);
    const msgCountBuf = Buffer.allocUnsafe(4);
    msgCountBuf.writeInt32LE(index);
    const [messageAddress] = await web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.messageSeed, mailboxAddress.toBuffer(), msgCountBuf],
      this.program.programId,
    );

    return messageAddress;
  }

  private async fetchMailbox(mailboxAddress?: web3.PublicKey) {
    const address = mailboxAddress ?? (await this.getMailboxAddress());
    const mailboxAccount = await this.program.account.mailbox.fetchNullable(address);
    return mailboxAccount;
  }

  private validateWallet() {
    if (!this.wallet.publicKey!.equals(this.mailboxOwner)) {
      throw new Error('`mailboxOwner` must equal `wallet.publicKey` to send transaction');
    }
    if (this.payer && !this.payer.equals(this.mailboxOwner)) {
      throw new Error('`mailboxOwner` must equal `payer` to send transaction');
    }
  }

  private async sendTransaction(tx: web3.Transaction) {
    let sig: string;
    if ('sendTransaction' in this.wallet) {
      const wallet = this.wallet as WalletAdapterInterface;
      sig = await wallet.sendTransaction(tx, this.conn);
    } else if ('payer' in this.wallet) {
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
      tx.feePayer = this.wallet.publicKey!;
    }
    return tx;
  }

  // Obfuscation
  private _obfuscationPrefix = '__o__';

  private getObfuscationKey(publicKey: web3.PublicKey) {
    return `PK_${publicKey.toBase58()}`;
  }

  private obfuscateMessage(message: string, receiverAddress: web3.PublicKey) {
    const key = this.getObfuscationKey(receiverAddress);
    const obfuscated = CryptoJS.AES.encrypt(message, key).toString();
    return `${this._obfuscationPrefix}${obfuscated}`;
  }

  private unObfuscateMessage(message: string) {
    if (message.startsWith(this._obfuscationPrefix)) {
      const innerMessage = message.substring(this._obfuscationPrefix.length);
      const key = this.getObfuscationKey(this.wallet.publicKey!);
      return CryptoJS.AES.decrypt(innerMessage, key).toString(CryptoJS.enc.Utf8);
    }
    return message;
  }
}

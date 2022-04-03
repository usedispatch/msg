import * as splToken from '@solana/spl-token';
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

export type IncentiveArgs = {
  mint: web3.PublicKey;
  amount: number;
  payerAccount: web3.PublicKey;
};

export type SendOpts = {
  incentive?: IncentiveArgs;
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
  async send(data: string, receiverAddress: web3.PublicKey, opts?: SendOpts): Promise<string> {
    this.validateWallet();
    const tx = await this.makeSendTx(data, receiverAddress, opts);
    return this.sendTransaction(tx);
  }

  /// @deprecated use delete instead
  async pop(): Promise<string> {
    this.validateWallet();
    const tx = await this.makePopTx();
    return this.sendTransaction(tx);
  }

  async delete(messageId: number, receiverAddress?: web3.PublicKey): Promise<string> {
    this.validateWallet();
    const tx = await this.makeDeleteTx(messageId, receiverAddress);
    return this.sendTransaction(tx);
  }

  async claimIncentive(messageId: number): Promise<string> {
    this.validateWallet();
    const tx = await this.makeClaimIncentiveTx(messageId);
    return this.sendTransaction(tx);
  }

  async fetchSent(receiverAddress?: web3.PublicKey): Promise<MessageAccount[]> {

    console.log('fetch sent messages to receiver: ', receiverAddress!.toBase58());

    const toMailboxAddress = await this.getMailboxAddress(receiverAddress);
    const mailbox = await this.fetchMailbox(toMailboxAddress);

    console.log('fetched mailbox for receiver: ', mailbox);

    if (!mailbox) {
      return [];
    }

    const numMessages = mailbox.messageCount;
    console.log('num messages in fetched receiver mailbox: ', numMessages);

    if (0 === numMessages) {
      return [];
    }

    const messageIds = Array(numMessages)
      .fill(0)
      .map((_element, index) => index + mailbox.readMessageCount);

    console.log('>>> messageIds in receiver mailbox: ', messageIds);

    const addresses = await Promise.all(messageIds.map((id) => this.getMessageAddress(id)));

    console.log('>> addresses of receiver mailbox messages: ', addresses);

    const messages = await this.program.account.message.fetchMultiple(addresses);

    console.log('>> actual messages in mailbox: ', messages);

    const normalize = (messageAccount: any | null, index: number) => {
      return this.normalizeMessageAccount(messageAccount, index + mailbox.readMessageCount);
    };


    const m = messages.map(normalize).filter((m): m is MessageAccount => m !== null);

    console.log('>> final normalized messages: ', m);

    return m;
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
    const addresses = await Promise.all(messageIds.map((id) => this.getMessageAddress(id)));
    const messages = await this.program.account.message.fetchMultiple(addresses);
    const normalize = (messageAccount: any | null, index: number) => {
      return this.normalizeMessageAccount(messageAccount, index + mailbox.readMessageCount);
    };
    return messages.map(normalize).filter((m): m is MessageAccount => m !== null);
  }

  async getMessageById(messageId: number): Promise<MessageAccount> {
    const messageAddress = await this.getMessageAddress(messageId);
    const messageAccount = await this.program.account.message.fetch(messageAddress);
    return this.normalizeMessageAccount(messageAccount, messageId)!;
  }

  async count() {
    return (await this.fetch()).length;
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
  async makeSendTx(data: string, receiverAddress: web3.PublicKey, opts?: SendOpts): Promise<web3.Transaction> {
    const toMailboxAddress = await this.getMailboxAddress(receiverAddress);
    let messageIndex = 0;

    const toMailbox = await this.fetchMailbox(toMailboxAddress);
    if (toMailbox) {
      messageIndex = toMailbox.messageCount;
    }

    const messageAddress = await this.getMessageAddress(messageIndex, receiverAddress);

    const message = this.obfuscate ? this.obfuscateMessage(data, receiverAddress) : data;

    const accounts = {
      mailbox: toMailboxAddress,
      receiver: receiverAddress,
      message: messageAddress,
      payer: this.payer ?? this.mailboxOwner,
      sender: this.mailboxOwner,
      feeReceiver: this.addresses.treasuryAddress,
      systemProgram: web3.SystemProgram.programId,
    };

    let tx: web3.Transaction;
    if (opts?.incentive) {
      const ata = await splToken.getAssociatedTokenAddress(opts.incentive.mint, messageAddress, true);
      const incentiveAccounts = {
        ...accounts,
        incentiveMint: opts.incentive.mint,
        payerTokenAccount: opts.incentive.payerAccount,
        incentiveTokenAccount: ata,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        associatedTokenProgram: splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      };
      tx = this.program.transaction.sendMessageWithIncentive(message, new anchor.BN(opts.incentive.amount), {
        accounts: incentiveAccounts,
      });
    } else {
      tx = this.program.transaction.sendMessage(message, { accounts });
    }

    return this.setTransactionPayer(tx);
  }

  /// @deprecated use makeDeleteTx instead
  async makePopTx(): Promise<web3.Transaction> {
    const mailboxAddress = await this.getMailboxAddress();
    const mailbox = await this.fetchMailbox();
    if (!mailbox) {
      throw new Error(`Mailbox ${mailboxAddress.toBase58()} not found`);
    }
    return this.makeDeleteTx(mailbox.readMessageCount, this.mailboxOwner);
  }

  /// Returns null if message account doesn't exist, the transaction otherwise
  async makeDeleteTx(messageId: number, receiverAddress?: web3.PublicKey): Promise<web3.Transaction> {
    const messageAddress = await this.getMessageAddress(messageId, receiverAddress ?? this.mailboxOwner);
    const messageAccount = await this.program.account.message.fetch(messageAddress);
    const tx = await this.program.methods
      .deleteMessage(messageId)
      .accounts({
        receiver: receiverAddress ?? this.mailboxOwner,
        authorizedDeleter: this.mailboxOwner,
        rentDestination: messageAccount.payer,
      })
      .transaction();
    return this.setTransactionPayer(tx);
  }

  /// Returns null if message account doesn't exist, the transaction otherwise
  async makeClaimIncentiveTx(messageId: number, receiverAddress?: web3.PublicKey): Promise<web3.Transaction> {
    const receiver = receiverAddress ?? this.mailboxOwner;
    const messageAddress = await this.getMessageAddress(messageId, receiver);
    const messageAccount = await this.program.account.message.fetch(messageAddress);
    const mint = messageAccount.incentiveMint;
    const ata = await splToken.getAssociatedTokenAddress(mint, messageAddress, true);
    const receiverAta = await splToken.getAssociatedTokenAddress(mint, receiver, true);
    const tx = await this.program.methods
      .claimIncentive(messageId)
      .accounts({
        receiver,
        rentDestination: messageAccount.payer,
        incentiveMint: mint,
        incentiveTokenAccount: ata,
        receiverTokenAccount: receiverAta,
      })
      .transaction();
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

  private normalizeMessageAccount(messageAccount: any, messageId: number): MessageAccount | null {
    if (messageAccount === null) return null;
    console.log('normalizeMessageAccount: message account', messageAccount);
    console.log('normalizeMessageAccount: message ID', messageId);

    return {
      sender: messageAccount.sender,
      payer: messageAccount.payer,
      data: this.unObfuscateMessage(messageAccount.data),
      messageId,
    } as MessageAccount;
  }
}

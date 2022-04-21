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
import { convertSolanartToDispatchMessage } from './solanart';

export type MailboxAccount = {
  messageCount: number;
  readMessageCount: number;
};

export type ParsedMessageData = {
  subj?: string;
  body?: string;
  /// ts is in seconds
  ts?: number;
  meta?: object;
  ns?: string;
};

export type MessageData = {
  subj?: string;
  body: string;
  ts?: Date;
  meta?: object;
};

export type MessageAccount = {
  sender: web3.PublicKey;
  receiver: web3.PublicKey;
  data: MessageData;
  messageId: number;
};

/// @deprecated Use MessageAccount instead
export type DeprecatedMessageAccount = {
  sender: web3.PublicKey;
  receiver: web3.PublicKey;
  data: string;
  messageId: number;
};

export type SentMessageAccount = {
  receiver: web3.PublicKey;
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
        anchor.setProvider(new anchor.AnchorProvider(conn, anchorWallet, {}));
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

  async sendMessage(subj: string, body: string, receiverAddress: web3.PublicKey, opts?: SendOpts, meta?: object): Promise<string> {
    this.validateWallet();
    const ts = new Date().getTime() / 1000;
    const enhancedMessage = { subj, body, ts, meta };
    const tx = await this.makeSendTx(JSON.stringify(enhancedMessage), receiverAddress, opts);
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

  async deleteMessage(message: MessageAccount): Promise<string> {
    this.validateWallet();
    const tx = await this.makeDeleteTx(message.messageId, message.receiver);
    return this.sendTransaction(tx);
  }

  async claimIncentive(messageId: number): Promise<string> {
    this.validateWallet();
    const tx = await this.makeClaimIncentiveTx(messageId);
    return this.sendTransaction(tx);
  }

  /** @deprecated Upgrade to fetchMessages */
  async fetch(): Promise<DeprecatedMessageAccount[]> {
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
      return this.normalizeMessageAccountDeprecated(messageAccount, index + mailbox.readMessageCount);
    };
    return messages.map(normalize).filter((m): m is DeprecatedMessageAccount => m !== null);
  }

  async fetchMessages(): Promise<MessageAccount[]> {
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

  async fetchMessageById(messageId: number): Promise<MessageAccount> {
    const messageAddress = await this.getMessageAddress(messageId);
    const messageAccount = await this.program.account.message.fetch(messageAddress);
    return this.normalizeMessageAccount(messageAccount, messageId)!;
  }

  async fetchSentMessagesTo(receiverAddress: web3.PublicKey): Promise<MessageAccount[]> {
    const receiverMailbox = new Mailbox(this.conn, this.wallet, {mailboxOwner: receiverAddress});
    const sentToReceiver = (await receiverMailbox.fetchMessages()).filter((m) => {
      return m.sender.equals(this.mailboxOwner);
    });
    return sentToReceiver;
  }

  async count() {
    return (await this.fetchMessages()).length;
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

  /** @deprecated use makeDeleteTx instead */
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
          receiver: event.receiverPubkey,
          data: this.unpackMessageData(event.message, event.senderPubkey, event.receiverPubkey),
          messageId: event.messageIndex,
        });
      }
    });
  }

  addSentMessageListener(callback: (message: SentMessageAccount) => void): number {
    return this.program.addEventListener(eventName, (event: any, _slot: number) => {
      if (event.senderPubkey.equals(this.mailboxOwner)) {
        callback({
          receiver: event.receiverPubkey,
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

  private unObfuscateMessage(message: string, sender: web3.PublicKey, receiver: web3.PublicKey) {
    // Bugfix: obfuscate-fix
    // Check if this message starts with a prefix and that the current wallet was a party to 
    // the message.
    // The right obfuscation key is that of the MailBoxOwner not the current wallet
    // in the two cases a mailbox is initialized,
    // When a mailbox is initialized by a user to get their sent messages
    // When a mailbox is initialized by a user to get their received messages

    if (message.startsWith(this._obfuscationPrefix) && (this.wallet.publicKey?.equals(sender) || this.wallet.publicKey?.equals(receiver))) {
      const innerMessage = message.substring(this._obfuscationPrefix.length);
      const obfuscationKey = this.mailboxOwner;
      const key = this.getObfuscationKey(obfuscationKey);
      return CryptoJS.AES.decrypt(innerMessage, key).toString(CryptoJS.enc.Utf8);
    }
    return message;
  }

  private unpackMessageData(message: string, sender: web3.PublicKey, receiver: web3.PublicKey): MessageData {
    const data = this.unObfuscateMessage(message, sender, receiver);
    try {
      if (data.startsWith("{")) {
        const parsedData = JSON.parse(data) as ParsedMessageData;
        if (parsedData.ns === "solanart") {
          return convertSolanartToDispatchMessage(parsedData);
        }
        return {
          subj: parsedData.subj,
          body: parsedData.body ?? "",
          ts: parsedData.ts ? new Date(1000 * +parsedData.ts) : undefined,
          meta: parsedData.meta,
        };
      }
    } catch (e) {
      // do nothing and just return the default
    }
    return { body: data };
  }

  /** @deprecated Upgrade to fetchMessages / normalizeMessageAccount */
  private normalizeMessageAccountDeprecated(messageAccount: any, messageId: number): DeprecatedMessageAccount | null {
    if (messageAccount === null) return null;
    return {
      sender: messageAccount.sender,
      receiver: this.mailboxOwner,
      payer: messageAccount.payer,
      data: this.unObfuscateMessage(messageAccount.data, messageAccount.sender, this.mailboxOwner),
      messageId,
    } as DeprecatedMessageAccount;
  }

  private normalizeMessageAccount(messageAccount: any, messageId: number): MessageAccount | null {
    if (messageAccount === null) return null;
    return {
      sender: messageAccount.sender,
      receiver: this.mailboxOwner,
      payer: messageAccount.payer,
      data: this.unpackMessageData(messageAccount.data, messageAccount.sender, this.mailboxOwner),
      messageId,
    } as MessageAccount;
  }
}

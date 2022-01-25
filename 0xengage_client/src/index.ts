import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Messaging } from '../../target/types/messaging';
import messagingProgramIdl from '../../target/idl/messaging.json';

export type MailboxAccount = {
  messageCount: number;
  readMessageCount: number;
};

export type MessageAccount = {
  sender: anchor.web3.PublicKey;
  data: string;
};

export type MailboxReceiver =
  | {
      receiverAddress: anchor.web3.PublicKey;
    }
  | {
      receiver: anchor.web3.Keypair;
    };

export type MailboxPayer =
  | {
      payerAddress: anchor.web3.PublicKey;
    }
  | {
      payer: anchor.web3.Keypair;
    };

export type MailboxSender =
  | {
      senderAddress: anchor.web3.PublicKey;
    }
  | {};

export type MailboxOpts = MailboxReceiver &
  MailboxPayer &
  MailboxSender & {
    skipAnchorProvider?: boolean;
  };

export class Mailbox {
  public receiverAddress: anchor.web3.PublicKey;
  public receiverKeypair: anchor.web3.Keypair | undefined;

  public payerAddress: anchor.web3.PublicKey;
  public payerKeypair: anchor.web3.Keypair | undefined;

  public senderAddress: anchor.web3.PublicKey;

  public program: Program<Messaging>;

  constructor(public conn: anchor.web3.Connection, opts: MailboxOpts) {
    if ('receiverAddress' in opts) {
      this.receiverAddress = opts.receiverAddress;
    } else {
      this.receiverAddress = opts.receiver.publicKey;
      this.receiverKeypair = opts.receiver;
    }

    if ('payerAddress' in opts) {
      this.payerAddress = opts.payerAddress;
    } else {
      this.payerKeypair = opts.payer;
      this.payerAddress = opts.payer.publicKey;
    }

    if ('senderAddress' in opts) {
      this.senderAddress = opts.senderAddress;
    } else {
      this.senderAddress = this.payerAddress;
    }

    // Initialize anchor
    if (!opts.skipAnchorProvider) {
      const wallet = this.payerKeypair ?? anchor.web3.Keypair.generate();
      anchor.setProvider(new anchor.Provider(conn, new anchor.Wallet(wallet), {}));
    }
    this.program = new Program<Messaging>(messagingProgramIdl as any, messagingProgramIdl.metadata.address);
  }

  /*
    Porcelain commands
  */
  async send(data: string) {
    if (!this.payerKeypair) {
      throw new Error('`payer` must be a Keypair');
    }

    const tx = await this.makeSendTx(data);
    tx.feePayer = this.payerAddress;

    const sig = await this.conn.sendTransaction(tx, [this.payerKeypair]);
    await this.conn.confirmTransaction(sig, 'recent');
    return sig;
  }

  async pop() {
    if (!this.receiverKeypair) {
      throw new Error('`receiver` must be a Keypair to `pop`, is `PublicKey`');
    }
    if (!this.payerKeypair) {
      throw new Error('`payer` must be a Keypair');
    }

    const tx = await this.makePopTx();
    tx.feePayer = this.payerAddress;

    const sig = await this.conn.sendTransaction(tx, [this.receiverKeypair, this.payerKeypair]);
    await this.conn.confirmTransaction(sig, 'recent');
    return sig;
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
  async makeSendTx(data: string): Promise<anchor.web3.Transaction> {
    const mailboxAddress = await this.getMailboxAddress();
    let messageIndex = 0;

    const mailbox = await this.fetchMailbox();
    if (mailbox) {
      messageIndex = mailbox.messageCount;
    }

    const messageAddress = await this.getMessageAddress(messageIndex);

    const tx = this.program.transaction.sendMessage(data, {
      accounts: {
        mailbox: mailboxAddress,
        receiver: this.receiverAddress,
        message: messageAddress,
        payer: this.payerAddress,
        sender: this.payerAddress,
        feeReceiver: TREASURY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    return tx;
  }

  async makePopTx(): Promise<anchor.web3.Transaction> {
    const mailboxAddress = await this.getMailboxAddress();
    const mailbox = await this.fetchMailbox();
    if (!mailbox) {
      throw new Error(`Mailbox ${mailboxAddress.toBase58()} not found`);
    }

    const messageAddress = await this.getMessageAddress(mailbox.readMessageCount);
    const messageAccount = await this.program.account.message.fetch(messageAddress);

    const tx = await this.program.transaction.closeMessage({
      accounts: {
        mailbox: mailboxAddress,
        receiver: this.receiverAddress,
        message: messageAddress,
        rentDestination: messageAccount.payer,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    return tx;
  }

  /*
    Utility functions
  */

  async getMailboxAddress() {
    const [mailbox] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(PROTOCOL_SEED), Buffer.from(MAILBOX_SEED), this.receiverAddress.toBuffer()],
      this.program.programId,
    );

    return mailbox;
  }

  async getMessageAddress(index: number) {
    const msgCountBuf = Buffer.allocUnsafe(4);
    msgCountBuf.writeInt32LE(index);
    const [message] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(PROTOCOL_SEED), Buffer.from(MESSAGE_SEED), this.receiverAddress.toBuffer(), msgCountBuf],
      this.program.programId,
    );

    return message;
  }

  private async fetchMailbox() {
    const mailboxAccount = await this.program.account.mailbox.fetchNullable(await this.getMailboxAddress());
    return mailboxAccount;
  }
}

// Some constants
export const TREASURY = new anchor.web3.PublicKey(
  messagingProgramIdl.constants
    .find((c) => c.name === 'TREASURY_ADDRESS')!
    .value.replace('solana_program :: pubkey ! ("', '')
    .replace('")', ''),
);
export const PROTOCOL_SEED = messagingProgramIdl.constants
  .find((c) => c.name === 'PROTOCOL_SEED')!
  .value.replace(/"/g, '');
export const MAILBOX_SEED = messagingProgramIdl.constants
  .find((c) => c.name === 'MAILBOX_SEED')!
  .value.replace(/"/g, '');
export const MESSAGE_SEED = messagingProgramIdl.constants
  .find((c) => c.name === 'MESSAGE_SEED')!
  .value.replace(/"/g, '');
export const MESSAGE_FEE_LAMPORTS = +messagingProgramIdl.constants.find((c) => c.name === 'MESSAGE_FEE_LAMPORTS')!
  .value;

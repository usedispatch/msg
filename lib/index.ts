import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Messaging } from '../target/types/messaging';
import messagingProgramIdl from '../target/idl/messaging.json';

const program = new Program<Messaging>(messagingProgramIdl as any, messagingProgramIdl.metadata.address);

export type MailboxAccount = {
  messageCount: number,
  readMessageCount: number,
}

export type MessageAccount = {
  sender: anchor.web3.PublicKey,
  data: string,
}

export type MailboxOpts = {
  receiver: anchor.web3.PublicKey | anchor.web3.Keypair,
  payer: anchor.web3.PublicKey | anchor.web3.Keypair,
}

export class Mailbox {
  public receiverAddress: anchor.web3.PublicKey;
  public receiverKeypair: anchor.web3.Keypair | undefined;

  public payerAddress: anchor.web3.PublicKey;
  public payerKeypair: anchor.web3.Keypair | undefined;

  constructor(public conn: anchor.web3.Connection, opts: MailboxOpts) {
    if (opts.receiver instanceof anchor.web3.PublicKey) {
      this.receiverAddress = opts.receiver;
    } else {
      this.receiverKeypair = opts.receiver;
      this.receiverAddress = opts.receiver.publicKey;
    }
    if (opts.payer instanceof anchor.web3.PublicKey) {
      this.payerAddress = opts.payer;
    } else {
      this.payerKeypair = opts.payer;
      this.payerAddress = opts.payer.publicKey;
    }
  }

  /*
    Porcelain commands
  */
  async send(data: string) {
    if (!this.payerKeypair) {
      throw new Error("`payer` must be a Keypair")
    }

    const tx = await this.makeSendTx(data);
    tx.feePayer = this.payerAddress;

    const sig = await this.conn.sendTransaction(tx, [this.payerKeypair]);
    await this.conn.confirmTransaction(sig, "recent");
    return sig;
  }

  async pop() {
    if (!this.receiverKeypair) {
      throw new Error("`receiver` must be a Keypair to `pop`, is `PublicKey`");
    }
    if (!this.payerKeypair) {
      throw new Error("`payer` must be a Keypair")
    }

    const tx = await this.makePopTx();
    tx.feePayer = this.payerAddress;

    const sig = await this.conn.sendTransaction(tx, [this.receiverKeypair, this.payerKeypair]);
    await this.conn.confirmTransaction(sig, "recent");
    return sig;
  }

  async fetch() {
    const mailbox = await this.fetchMailbox();
    const messages: MessageAccount[] = [];
    for (let i = mailbox.readMessageCount; i < mailbox.messageCount; i++) {
      const message = await this.getMessageAddress(i);
      const messageAccount = await program.account.message.fetch(message);
      messages.push(messageAccount as MessageAccount);
    }

    return messages;
  }

  /*
    Transaction generation commands
  */
  async makeSendTx(data: string): Promise<anchor.web3.Transaction> {
    const mailboxAddress = await this.getMailboxAddress();
    let messageIndex = 0;

    try {
      const mailbox = await this.fetchMailbox();
      messageIndex = mailbox.messageCount;
    } catch(err) {
      // This may fail if mailbox doesn't exist, which is fine.
      // It will get created on first send.
    }

    const messageAddress = await this.getMessageAddress(messageIndex);

    const tx = program.transaction.sendMessage(data, {
      accounts: {
        mailbox: mailboxAddress,
        receiver: this.receiverAddress,
        message: messageAddress,
        payer: this.payerAddress,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    return tx;
  }

  async makePopTx(): Promise<anchor.web3.Transaction> {
    const mailboxAddress = await this.getMailboxAddress();
    const mailbox = await this.fetchMailbox();
    const messageAddress = await this.getMessageAddress(mailbox.readMessageCount);

    const tx = await program.transaction.closeMessage({
      accounts: {
        mailbox: mailboxAddress,
        receiver: this.receiverAddress,
        message: messageAddress,
        rentDestination: this.receiverAddress,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    return tx;
  }

  /*
    Utility functions
  */

  async getMailboxAddress() {
    const [mailbox] = await anchor.web3.PublicKey.findProgramAddress([
      Buffer.from("messaging"),
      Buffer.from("mailbox"),
      this.receiverAddress.toBuffer(),
    ], program.programId);

    return mailbox;
  }
  
  async getMessageAddress(index: number) {
    const msgCountBuf = Buffer.allocUnsafe(4);
    msgCountBuf.writeInt32LE(index);
    const [message] = await anchor.web3.PublicKey.findProgramAddress([
      Buffer.from("messaging"),
      Buffer.from("message"),
      this.receiverAddress.toBuffer(),
      msgCountBuf,
    ], program.programId);

    return message;
  }

  private async fetchMailbox() {
    const mailboxAccount = await program.account.mailbox.fetch(await this.getMailboxAddress());
    return mailboxAccount;
  }
}

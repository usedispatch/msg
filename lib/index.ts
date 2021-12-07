import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Messaging } from '../target/types/messaging';

const program = anchor.workspace.Messaging as Program<Messaging>;

export type MailboxAccount = {
  messageCount: number,
  readMessageCount: number,
}

export type MessageAccount = {
  sender: anchor.web3.PublicKey,
  data: string,
}

export class Mailbox {
  public receiverAddress: anchor.web3.PublicKey;
  public signer: anchor.web3.Keypair | undefined;

  constructor(public conn: anchor.web3.Connection, public receiver: anchor.web3.PublicKey | anchor.web3.Keypair) {
    if (receiver instanceof anchor.web3.PublicKey) {
      this.receiverAddress = receiver;
    } else {
      this.signer = receiver;
      this.receiverAddress = receiver.publicKey;
    }
  }

  async send(data: unknown, payer: anchor.web3.Keypair) {
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

    const tx = await program.rpc.sendMessage(data, {
      accounts: {
        mailbox: mailboxAddress,
        receiver: this.receiverAddress,
        message: messageAddress,
        payer: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [
        payer,
      ],
    });
    return tx;
  }

  async pop() {
    if (!this.signer) {
      throw new Error("`receiver` must be a Keypair to `pop`, is `PublicKey`");
    }

    const mailboxAddress = await this.getMailboxAddress();
    const mailbox = await this.fetchMailbox();
    const message = await this.getMessageAddress(mailbox.readMessageCount);

    const tx = await program.rpc.closeMessage({
      accounts: {
        mailbox: mailboxAddress,
        receiver: this.receiverAddress,
        message: message,
        rentDestination: this.receiverAddress,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [
        this.signer,
      ],
    });
    return tx;
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

import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Messaging } from '../target/types/messaging';

/*
  USAGE:

  ```
  // `receiver` can be a pubkey, or a keypair (if keypair, `pop` can be called)
  const mailbox = new Mailbox(conn, receiver);

  // Send messages like this (`payer` must sign):
  await mailbox.send("text0", "url0", payer);
  await mailbox.send("text1", "url1", payer);

  // Read messages like this (nobody has to sign)
  // Returns all new messages that haven't been popped
  const messages = await mailbox.fetch();

  // Close messages FIFO and return rent (receiver must sign)
  await mailbox.pop();
  await mailbox.pop();
  ```
*/

const program = anchor.workspace.Messaging as Program<Messaging>;

export type MailboxAccount = {
  messageCount: number,
  readMessageCount: number,
}

export type MessageAccount = {
  sender: anchor.web3.PublicKey,
  text: string,
  url: string,
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

  async send(text: string, url: string, payer: anchor.web3.Keypair) {
    const mailbox = await this.fetchMailbox();
    const message = await this.getMessageAddress(mailbox.messageCount);

    const tx = await program.rpc.sendMessage(text, url, {
      accounts: {
        mailbox: mailbox,
        receiver: this.receiverAddress,
        message: message,
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

    const mailbox = await this.fetchMailbox();
    const message = await this.getMessageAddress(mailbox.readMessageCount);

    const tx = await program.rpc.closeMessage({
      accounts: {
        mailbox: mailbox,
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
  
  async fetchMailbox() {
    const mailboxAccount = await program.account.mailbox.fetch(await this.getMailboxAddress());
    return mailboxAccount;
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
}

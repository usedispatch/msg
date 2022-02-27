import * as anchor from '@project-serum/anchor';
import { Program, web3 } from '@project-serum/anchor';
import { Messaging } from '../../target/types/messaging';
import messagingProgramIdl from '../../target/idl/messaging.json';

export type MailboxAccount = {
  messageCount: number;
  readMessageCount: number;
};

export type MessageAccount = {
  sender: web3.PublicKey;
  data: string;
};

export interface WalletInterface {
  signTransaction(tx: web3.Transaction): Promise<web3.Transaction>;
  signAllTransactions(txs: web3.Transaction[]): Promise<web3.Transaction[]>;
  get publicKey(): web3.PublicKey;
}

interface SendTransactionOptions extends web3.SendOptions {
  signers?: web3.Signer[];
}

interface WalletAdapterInterface extends WalletInterface {
  sendTransaction(transaction: web3.Transaction
    , connection: web3.Connection
    , options?: SendTransactionOptions
    ): Promise<web3.TransactionSignature>;
}

interface AnchorNodeWalletInterface extends WalletInterface {
  payer: web3.Signer;
}

export type MailboxOpts = {
  mailboxOwner?: web3.PublicKey;
  payer?: web3.PublicKey;
  skipAnchorProvider?: boolean;
}

export class Mailbox {
  public mailboxOwner: web3.PublicKey;
  public payer?: web3.PublicKey;

  public program: Program<Messaging>;

  constructor(public conn: web3.Connection, public wallet: WalletInterface, opts?: MailboxOpts) {
    this.mailboxOwner = opts?.mailboxOwner ?? wallet.publicKey;
    this.payer = opts?.payer;
  
    // Initialize anchor
    if (!opts?.skipAnchorProvider) {
      anchor.setProvider(new anchor.Provider(conn, this.wallet, {}));
    }
    // TODO: make constants more explicit, and even further in future, codegen them
    this.program = new Program<Messaging>(messagingProgramIdl as any, messagingProgramIdl.metadata.address);
  }

  private validatePorcelainAllowed() {
    if (!this.wallet.publicKey.equals(this.mailboxOwner)) {
      throw new Error('`mailboxOwner` and `wallet.publicKey` must equal in order to use porcelain commands');
    }
    if (this.payer && !this.payer.equals(this.mailboxOwner)) {
      throw new Error('`mailboxOwner` and `payer` must equal in order to use porcelain commands');
    }
  }

  private async sendTransaction(tx: web3.Transaction) {
    // TODO: implement to handle the different types of wallets
    // if anchor
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

  private setPayer(tx: web3.Transaction): web3.Transaction {
    if (this.payer) {
      tx.feePayer = this.wallet.publicKey;
    }
    return tx;
  }

  /*
    Porcelain commands
  */
  async send(data: string, receiverAddress: web3.PublicKey): Promise<string> {
    this.validatePorcelainAllowed();
    const tx = await this.makeSendTx(data, receiverAddress);
    return this.sendTransaction(tx);
  }

  async pop(): Promise<string> {
    this.validatePorcelainAllowed();
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
        feeReceiver: TREASURY,
        systemProgram: web3.SystemProgram.programId,
      },
    });

    return this.setPayer(tx);
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

    return this.setPayer(tx);
  }

  /*
    Utility functions
  */

  async getMailboxAddress(mailboxOwner?: web3.PublicKey) {
    const ownerAddress = mailboxOwner ?? this.mailboxOwner;
    const [mailboxAddress] = await web3.PublicKey.findProgramAddress(
      [Buffer.from(PROTOCOL_SEED), Buffer.from(MAILBOX_SEED), ownerAddress.toBuffer()],
      this.program.programId,
    );

    return mailboxAddress;
  }

  async getMessageAddress(index: number, receiverAddress?: web3.PublicKey) {
    const receiver = receiverAddress ?? this.mailboxOwner;
    const msgCountBuf = Buffer.allocUnsafe(4);
    msgCountBuf.writeInt32LE(index);
    const [messageAddress] = await web3.PublicKey.findProgramAddress(
      [Buffer.from(PROTOCOL_SEED), Buffer.from(MESSAGE_SEED), receiver.toBuffer(), msgCountBuf],
      this.program.programId,
    );

    return messageAddress;
  }

  private async fetchMailbox(mailboxAddress?: web3.PublicKey) {
    const address = mailboxAddress ?? await this.getMailboxAddress();
    const mailboxAccount = await this.program.account.mailbox.fetchNullable(address);
    return mailboxAccount;
  }
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

// Some constants
// anchor doesn't provide constants in an easy typescript interface as of 0.22.
// in particular, the rust macro that generates the constants block in the IDL
// leaves some of the native rust formatting in the IDL. That's why we need to
// do all this string search and replace.
export const TREASURY = new web3.PublicKey(
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

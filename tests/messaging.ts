import * as anchor from '@project-serum/anchor';
import { strict as assert } from 'assert';
import { Program } from '@project-serum/anchor';
import { Messaging } from '../target/types/messaging';

describe('messaging', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.Messaging as Program<Messaging>;

  it('Basic test', async () => {
    const conn = anchor.getProvider().connection;
  
    const receiver = anchor.web3.Keypair.generate();

    const payer = anchor.web3.Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    // send a couple of messages
    const [mailbox] = await anchor.web3.PublicKey.findProgramAddress([
      Buffer.from("messaging"),
      Buffer.from("mailbox"),
      receiver.publicKey.toBuffer(),
    ], program.programId)

    // Send first message
    const msgCountBuf0 = Buffer.allocUnsafe(4);
    msgCountBuf0.writeInt32LE(0);
    const [message0] = await anchor.web3.PublicKey.findProgramAddress([
      Buffer.from("messaging"),
      Buffer.from("message"),
      receiver.publicKey.toBuffer(),
      msgCountBuf0,
    ], program.programId);

    const tx0 = await program.rpc.sendMessage("text0", "url0", {
      accounts: {
        mailbox: mailbox,
        receiver: receiver.publicKey,
        message: message0,
        payer: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [
        payer,
      ],
    });
    await conn.confirmTransaction(tx0);

    // Send second message
    const msgCountBuf1 = Buffer.allocUnsafe(4);
    msgCountBuf1.writeInt32LE(1);
    const [message1] = await anchor.web3.PublicKey.findProgramAddress([
      Buffer.from("messaging"),
      Buffer.from("message"),
      receiver.publicKey.toBuffer(),
      msgCountBuf1,
    ], program.programId);

    const tx1 = await program.rpc.sendMessage("text1", "url1", {
      accounts: {
        mailbox: mailbox,
        receiver: receiver.publicKey,
        message: message1,
        payer: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [
        payer,
      ],
    });
    await conn.confirmTransaction(tx1);

    // assert mailbox and messages look good
    let mailboxAccount = await program.account.mailbox.fetch(mailbox);
    assert.ok(mailboxAccount.messageCount === 2);
    assert.ok(mailboxAccount.readMessageCount === 0);

    const messageAccount0 = await program.account.message.fetch(message0);

    assert.ok(messageAccount0.sender.equals(payer.publicKey))
    assert.ok(messageAccount0.text === "text0");
    assert.ok(messageAccount0.url === "url0");
    
    const messageAccount1 = await program.account.message.fetch(message1);
    assert.ok(messageAccount1.sender.equals(payer.publicKey))
    assert.ok(messageAccount1.text === "text1");
    assert.ok(messageAccount1.url === "url1");

    // close messages
    const tx2 = await program.rpc.closeMessage({
      accounts: {
        mailbox: mailbox,
        receiver: receiver.publicKey,
        message: message0,
        rentDestination: receiver.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [
        receiver,
      ],
    });
    await conn.confirmTransaction(tx2);

    const tx3 = await program.rpc.closeMessage({
      accounts: {
        mailbox: mailbox,
        receiver: receiver.publicKey,
        message: message1,
        rentDestination: receiver.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [
        receiver,
      ],
    });
    await conn.confirmTransaction(tx3);

    // assert mailbox looks good and rent was returned
    mailboxAccount = await program.account.mailbox.fetch(mailbox);
    assert.ok(mailboxAccount.messageCount === 2);
    assert.ok(mailboxAccount.readMessageCount === 2);

    const receiverBalance = await conn.getBalance(receiver.publicKey);
    assert.ok(receiverBalance !== 0);
  });
});

import * as anchor from '@project-serum/anchor';
import { strict as assert } from 'assert';
import { Program } from '@project-serum/anchor';
import { Messaging } from '../target/types/messaging';
import { Mailbox } from '../0xengage_client/src';

describe('messaging', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.Messaging as Program<Messaging>;
  const conn = anchor.getProvider().connection;

  it('Basic test', async () => {
    const receiver = anchor.web3.Keypair.generate();
    const sender = anchor.web3.Keypair.generate();

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

    const tx0 = await program.rpc.sendMessage("text0", {
      accounts: {
        mailbox: mailbox,
        receiver: receiver.publicKey,
        message: message0,
        payer: payer.publicKey,
        sender: sender.publicKey,
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

    const tx1 = await program.rpc.sendMessage("text1", {
      accounts: {
        mailbox: mailbox,
        receiver: receiver.publicKey,
        message: message1,
        payer: payer.publicKey,
        sender: sender.publicKey,
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

    assert.ok(messageAccount0.sender.equals(sender.publicKey))
    assert.ok(messageAccount0.data === "text0");

    const messageAccount1 = await program.account.message.fetch(message1);
    assert.ok(messageAccount1.sender.equals(sender.publicKey))
    assert.ok(messageAccount1.data === "text1");

    // close messages
    const tx2 = await program.rpc.closeMessage({
      accounts: {
        mailbox: mailbox,
        receiver: receiver.publicKey,
        message: message0,
        rentDestination: payer.publicKey,
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
        rentDestination: payer.publicKey,
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

    const payerBalance = await conn.getBalance(payer.publicKey);
    assert.ok(payerBalance >= 199899760);
  });

  it('Client library porcelain commands test', async () => {
    // Set up accounts
    const receiver = anchor.web3.Keypair.generate();
    const sender = anchor.web3.Keypair.generate();
    const senderAddress = sender.publicKey;
    const payer = anchor.web3.Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    // Mailbox usage
    const mailbox = new Mailbox(conn, {
      receiver, payer, senderAddress,
    });

    assert.ok((await mailbox.fetch()).length === 0);
    assert.ok(await mailbox.count() === 0);

    const emptyCountEx = await mailbox.countEx();
    assert.ok(emptyCountEx.messageCount === 0);
    assert.ok(emptyCountEx.readMessageCount === 0);

    await mailbox.send("text0");
    await mailbox.send("text1");

    assert.ok(await mailbox.count() === 2);

    const fullCountEx1 = await mailbox.countEx();
    assert.ok(fullCountEx1.messageCount === 2);
    assert.ok(fullCountEx1.readMessageCount === 0);

    let messages = await mailbox.fetch();
    assert.ok(messages.length === 2);

    assert.ok(messages[0].sender.equals(payer.publicKey))
    assert.ok(messages[0].data === "text0");

    assert.ok(messages[1].sender.equals(payer.publicKey))
    assert.ok(messages[1].data === "text1");

    await mailbox.pop();
    assert.ok(await mailbox.count() === 1);

    messages = await mailbox.fetch();
    assert.ok(messages.length === 1);

    assert.ok(messages[0].sender.equals(payer.publicKey))
    assert.ok(messages[0].data === "text1");

    await mailbox.pop();
    assert.ok(await mailbox.count() === 0);

    const fullCountEx2 = await mailbox.countEx();
    assert.ok(fullCountEx2.messageCount === 2);
    assert.ok(fullCountEx2.readMessageCount === 2);

    messages = await mailbox.fetch();
    assert.ok(messages.length === 0);
  });

  it('Client library tx commands test', async () => {
    // Set up accounts
    const receiver = anchor.web3.Keypair.generate();
    const payer = anchor.web3.Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    // Mailbox usage
    const mailbox = new Mailbox(conn, {
      receiverAddress: receiver.publicKey,
      payerAddress: payer.publicKey,
    });

    // Send a message
    const sendTx = await mailbox.makeSendTx("test1");

    sendTx.feePayer = payer.publicKey;
    const sendSig = await conn.sendTransaction(sendTx, [payer]);
    await conn.confirmTransaction(sendSig, "recent");

    // Fetch messages
    let messages = await mailbox.fetch();
    assert.ok(messages.length === 1);

    assert.ok(messages[0].sender.equals(payer.publicKey))
    assert.ok(messages[0].data === "test1");

    // Free message account and send rent to receiver
    const popTx = await mailbox.makePopTx();

    popTx.feePayer = payer.publicKey;
    const popSig = await conn.sendTransaction(popTx, [payer, receiver]);
    await conn.confirmTransaction(popSig, "recent");

    // Fetch messages
    messages = await mailbox.fetch();
    assert.ok(messages.length === 0);
  });

  it('Returns rent to original payer', async () => {
    const receiver = anchor.web3.Keypair.generate();

    const payer = anchor.web3.Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    // Get mailbox address
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

    const tx0 = await program.rpc.sendMessage("text0", {
      accounts: {
        mailbox: mailbox,
        receiver: receiver.publicKey,
        message: message0,
        payer: payer.publicKey,
        sender: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [
        payer,
      ],
    });
    await conn.confirmTransaction(tx0);

    // close messages
    try {
      const tx1 = await program.rpc.closeMessage({
        accounts: {
          mailbox: mailbox,
          receiver: receiver.publicKey,
          message: message0,
          rentDestination: receiver.publicKey,  // Intentionally wrong
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [
          receiver,
        ],
      });
      await conn.confirmTransaction(tx1);
    } catch (e) {
      assert.ok(e instanceof anchor.ProgramError);
    }
  });
});

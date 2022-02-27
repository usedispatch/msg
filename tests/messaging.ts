import * as anchor from '@project-serum/anchor';
import { strict as assert } from 'assert';
import { Program } from '@project-serum/anchor';
import { Messaging } from '../target/types/messaging';
import { Mailbox, clusterAddresses, seeds } from '../usedispatch_client/src';

describe('messaging', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.Messaging as Program<Messaging>;
  const conn = anchor.getProvider().connection;
  const TREASURY = clusterAddresses.get("devnet").treasuryAddress;

  it('Basic test', async () => {
    const receiver = anchor.web3.Keypair.generate();
    const sender = anchor.web3.Keypair.generate();

    const payer = anchor.web3.Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const treasuryBalance = await conn.getBalance(TREASURY);

    // send a couple of messages
    const [mailbox] = await anchor.web3.PublicKey.findProgramAddress([
      seeds.protocolSeed,
      seeds.mailboxSeed,
      receiver.publicKey.toBuffer(),
    ], program.programId)

    // Send first message
    const msgCountBuf0 = Buffer.allocUnsafe(4);
    msgCountBuf0.writeInt32LE(0);
    const [message0] = await anchor.web3.PublicKey.findProgramAddress([
      seeds.protocolSeed,
      seeds.messageSeed,
      mailbox.toBuffer(),
      msgCountBuf0,
    ], program.programId);

    const tx0 = await program.rpc.sendMessage("text0", {
      accounts: {
        mailbox: mailbox,
        receiver: receiver.publicKey,
        message: message0,
        payer: payer.publicKey,
        sender: sender.publicKey,
        feeReceiver: TREASURY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [
        payer, sender,
      ],
    });
    await conn.confirmTransaction(tx0);

    // Send second message
    const msgCountBuf1 = Buffer.allocUnsafe(4);
    msgCountBuf1.writeInt32LE(1);
    const [message1] = await anchor.web3.PublicKey.findProgramAddress([
      seeds.protocolSeed,
      seeds.messageSeed,
      mailbox.toBuffer(),
      msgCountBuf1,
    ], program.programId);

    const tx1 = await program.rpc.sendMessage("text1", {
      accounts: {
        mailbox: mailbox,
        receiver: receiver.publicKey,
        message: message1,
        payer: payer.publicKey,
        sender: sender.publicKey,
        feeReceiver: TREASURY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [
        payer, sender,
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

    // const endTreasuryBalance = await conn.getBalance(TREASURY);
    // assert.equal(endTreasuryBalance, treasuryBalance + 2 * MESSAGE_FEE_LAMPORTS);

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
    const receiver = new anchor.Wallet(anchor.web3.Keypair.generate());
    const sender = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(sender.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(receiver.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    // Mailbox usage
    const senderMailbox = new Mailbox(conn, sender);
    const receiverMailbox = new Mailbox(conn, receiver);

    assert.ok((await receiverMailbox.fetch()).length === 0);
    assert.ok(await receiverMailbox.count() === 0);

    const emptyCountEx = await receiverMailbox.countEx();
    assert.ok(emptyCountEx.messageCount === 0);
    assert.ok(emptyCountEx.readMessageCount === 0);

    await senderMailbox.send("text0", receiver.publicKey);
    await senderMailbox.send("text1", receiver.publicKey);

    assert.ok(await receiverMailbox.count() === 2);

    const fullCountEx1 = await receiverMailbox.countEx();
    assert.ok(fullCountEx1.messageCount === 2);
    assert.ok(fullCountEx1.readMessageCount === 0);

    let messages = await receiverMailbox.fetch();
    assert.ok(messages.length === 2);

    assert.ok(messages[0].sender.equals(sender.publicKey))
    assert.ok(messages[0].data === "text0");

    assert.ok(messages[1].sender.equals(sender.publicKey))
    assert.ok(messages[1].data === "text1");

    await receiverMailbox.pop();
    assert.ok(await receiverMailbox.count() === 1);

    messages = await receiverMailbox.fetch();
    assert.ok(messages.length === 1);

    assert.ok(messages[0].sender.equals(sender.publicKey))
    assert.ok(messages[0].data === "text1");

    await receiverMailbox.pop();
    assert.ok(await receiverMailbox.count() === 0);

    const fullCountEx2 = await receiverMailbox.countEx();
    assert.ok(fullCountEx2.messageCount === 2);
    assert.ok(fullCountEx2.readMessageCount === 2);

    messages = await receiverMailbox.fetch();
    assert.ok(messages.length === 0);
  });

  it('Client library tx commands test', async () => {
    // Set up accounts
    const receiver = anchor.web3.Keypair.generate();
    const payer = anchor.web3.Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    // Mailbox usage
    const senderMailbox = new Mailbox(conn, new anchor.Wallet(payer));
    const receiverMailbox = new Mailbox(conn, new anchor.Wallet(receiver), {payer: payer.publicKey});

    // Send a message
    const sendTx = await senderMailbox.makeSendTx("test1", receiver.publicKey);

    sendTx.feePayer = payer.publicKey;
    const sendSig = await conn.sendTransaction(sendTx, [payer]);
    await conn.confirmTransaction(sendSig, "recent");

    // Fetch messages
    let messages = await receiverMailbox.fetch();
    assert.ok(messages.length === 1);

    assert.ok(messages[0].sender.equals(payer.publicKey))
    assert.ok(messages[0].data === "test1");

    // Free message account and send rent to receiver
    const popTx = await receiverMailbox.makePopTx();

    popTx.feePayer = payer.publicKey;
    const popSig = await conn.sendTransaction(popTx, [payer, receiver]);
    await conn.confirmTransaction(popSig, "recent");

    // Fetch messages
    messages = await receiverMailbox.fetch();
    assert.ok(messages.length === 0);
  });

  it('Returns rent to original payer', async () => {
    const receiver = anchor.web3.Keypair.generate();

    const payer = anchor.web3.Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    // Get mailbox address
    const [mailbox] = await anchor.web3.PublicKey.findProgramAddress([
      seeds.protocolSeed,
      seeds.mailboxSeed,
      receiver.publicKey.toBuffer(),
    ], program.programId)

    // Send first message
    const msgCountBuf0 = Buffer.allocUnsafe(4);
    msgCountBuf0.writeInt32LE(0);
    const [message0] = await anchor.web3.PublicKey.findProgramAddress([
      seeds.protocolSeed,
      seeds.messageSeed,
      mailbox.toBuffer(),
      msgCountBuf0,
    ], program.programId);

    const tx0 = await program.rpc.sendMessage("text0", {
      accounts: {
        mailbox: mailbox,
        receiver: receiver.publicKey,
        message: message0,
        payer: payer.publicKey,
        sender: payer.publicKey,
        feeReceiver: TREASURY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [
        payer,
      ],
    });
    await conn.confirmTransaction(tx0);

    // close messages
    const oldConsoleLog = console.log;
    const oldConsoleError = console.error;
    console.log = () => {};
    console.error = () => {};
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
    } catch (e) {
      assert.ok(String(e).startsWith("An address constraint was violated"));
    }
    console.log = oldConsoleLog;
    console.error = oldConsoleError;
  });

  it('Emits an event when sending', async () => {
    const receiver = anchor.web3.Keypair.generate();

    const payer = anchor.web3.Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    let eventEmitted = false
    const eventListener = program.addEventListener("DispatchMessage", async (event, slot) => {
      await program.removeEventListener(eventListener);
      assert.ok(receiver.publicKey.equals(event.receiverPubkey));
      assert.ok(payer.publicKey.equals(event.senderPubkey));
      assert.ok(event.messageIndex === 0);
      assert.ok(event.message === "text0");
      eventEmitted = true;
    });

    // Get mailbox address
    const [mailbox] = await anchor.web3.PublicKey.findProgramAddress([
      seeds.protocolSeed,
      seeds.mailboxSeed,
      receiver.publicKey.toBuffer(),
    ], program.programId)

    // Send first message
    const msgCountBuf0 = Buffer.allocUnsafe(4);
    msgCountBuf0.writeInt32LE(0);
    const [message0] = await anchor.web3.PublicKey.findProgramAddress([
      seeds.protocolSeed,
      seeds.messageSeed,
      mailbox.toBuffer(),
      msgCountBuf0,
    ], program.programId);

    const tx0 = await program.rpc.sendMessage("text0", {
      accounts: {
        mailbox: mailbox,
        receiver: receiver.publicKey,
        message: message0,
        payer: payer.publicKey,
        sender: payer.publicKey,
        feeReceiver: TREASURY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [
        payer,
      ],
    });
    await conn.confirmTransaction(tx0);

    assert.ok(eventEmitted);
  });
});

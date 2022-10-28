import * as splToken from '@solana/spl-token';
import * as anchor from '@project-serum/anchor';
import { strict as assert } from 'assert';
import { Program } from '@project-serum/anchor';
import { Messaging } from '../target/types/messaging';

import { Mailbox, clusterAddresses, seeds } from '../usedispatch_client/src';

describe('messaging', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Messaging as Program<Messaging>;
  const conn = anchor.getProvider().connection;
  const TREASURY = clusterAddresses.get('devnet').treasuryAddress;

  it('Basic test', async () => {
    const receiver = anchor.web3.Keypair.generate();
    const sender = anchor.web3.Keypair.generate();

    const payer = anchor.web3.Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(TREASURY, 1 * anchor.web3.LAMPORTS_PER_SOL));

    // send a couple of messages
    const [mailbox] = await anchor.web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.mailboxSeed, receiver.publicKey.toBuffer()],
      program.programId,
    );

    // Send first message
    const msgCountBuf0 = Buffer.allocUnsafe(4);
    msgCountBuf0.writeInt32LE(0);
    const [message0] = await anchor.web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.messageSeed, mailbox.toBuffer(), msgCountBuf0],
      program.programId,
    );

    const tx0 = await program.rpc.sendMessage('text0', {
      accounts: {
        mailbox,
        receiver: receiver.publicKey,
        message: message0,
        payer: payer.publicKey,
        sender: sender.publicKey,
        feeReceiver: TREASURY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [payer, sender],
    });
    await conn.confirmTransaction(tx0);

    // Send second message
    const msgCountBuf1 = Buffer.allocUnsafe(4);
    msgCountBuf1.writeInt32LE(1);
    const [message1] = await anchor.web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.messageSeed, mailbox.toBuffer(), msgCountBuf1],
      program.programId,
    );

    const tx1 = await program.rpc.sendMessage('text1', {
      accounts: {
        mailbox,
        receiver: receiver.publicKey,
        message: message1,
        payer: payer.publicKey,
        sender: sender.publicKey,
        feeReceiver: TREASURY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [payer, sender],
    });
    await conn.confirmTransaction(tx1);

    // assert mailbox and messages look good
    let mailboxAccount = await program.account.mailbox.fetch(mailbox);
    assert.ok(mailboxAccount.messageCount === 2);
    assert.ok(mailboxAccount.readMessageCount === 0);

    const messageAccount0 = await program.account.message.fetch(message0);

    assert.ok(messageAccount0.sender.equals(sender.publicKey));
    assert.ok(messageAccount0.data === 'text0');

    const messageAccount1 = await program.account.message.fetch(message1);
    assert.ok(messageAccount1.sender.equals(sender.publicKey));
    assert.ok(messageAccount1.data === 'text1');

    // delete messages
    const tx2 = await program.rpc.deleteMessage(0, {
      accounts: {
        mailbox,
        receiver: receiver.publicKey,
        authorizedDeleter: receiver.publicKey,
        message: message0,
        rentDestination: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [receiver],
    });
    await conn.confirmTransaction(tx2);

    const tx3 = await program.rpc.deleteMessage(1, {
      accounts: {
        mailbox,
        receiver: receiver.publicKey,
        authorizedDeleter: receiver.publicKey,
        message: message1,
        rentDestination: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [receiver],
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

    assert.ok((await receiverMailbox.fetchMessages()).length === 0);
    assert.ok((await receiverMailbox.count()) === 0);

    const emptyCountEx = await receiverMailbox.countEx();
    assert.ok(emptyCountEx.messageCount === 0);
    assert.ok(emptyCountEx.readMessageCount === 0);

    const treasuryBalance = await conn.getBalance(TREASURY);

    await senderMailbox.send('text0', receiver.publicKey);
    await senderMailbox.send('text1', receiver.publicKey);

    const endTreasuryBalance = await conn.getBalance(TREASURY);
    assert.equal(endTreasuryBalance, treasuryBalance + 2 * 50_000);

    assert.ok((await receiverMailbox.count()) === 2);

    const fullCountEx1 = await receiverMailbox.countEx();
    assert.ok(fullCountEx1.messageCount === 2);
    assert.ok(fullCountEx1.readMessageCount === 0);

    const firstMessage = await receiverMailbox.fetchMessageById(1);
    assert.ok(firstMessage.messageId === 1);
    assert.ok(firstMessage.data.body === 'text1');
    assert.ok(firstMessage.incentiveMint === undefined);

    let messages = await receiverMailbox.fetchMessages();
    assert.ok(messages.length === 2);

    assert.ok(messages[0].sender.equals(sender.publicKey));
    assert.ok(messages[0].data.body === 'text0');

    assert.ok(messages[1].sender.equals(sender.publicKey));
    assert.ok(messages[1].data.body === 'text1');

    await receiverMailbox.pop();
    assert.ok((await receiverMailbox.count()) === 1);

    messages = await receiverMailbox.fetchMessages();
    assert.ok(messages.length === 1);

    assert.ok(messages[0].sender.equals(sender.publicKey));
    assert.ok(messages[0].data.body === 'text1');

    await receiverMailbox.pop();
    assert.ok((await receiverMailbox.count()) === 0);

    const fullCountEx2 = await receiverMailbox.countEx();
    assert.ok(fullCountEx2.messageCount === 2);
    assert.ok(fullCountEx2.readMessageCount === 2);

    messages = await receiverMailbox.fetchMessages();
    assert.ok(messages.length === 0);
  });

  it('Client library tx commands test', async () => {
    // Set up accounts
    const receiver = anchor.web3.Keypair.generate();
    const payer = anchor.web3.Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    // Mailbox usage
    const senderMailbox = new Mailbox(conn, new anchor.Wallet(payer));
    const receiverMailbox = new Mailbox(conn, new anchor.Wallet(receiver), { payer: payer.publicKey });

    // Send a message
    const sendTx = await senderMailbox.makeSendTx('test1', receiver.publicKey);

    sendTx.feePayer = payer.publicKey;
    const sendSig = await conn.sendTransaction(sendTx, [payer]);
    await conn.confirmTransaction(sendSig, 'recent');

    // Fetch messages
    let messages = await receiverMailbox.fetchMessages();
    assert.ok(messages.length === 1);

    assert.ok(messages[0].sender.equals(payer.publicKey));
    assert.ok(messages[0].data.body === 'test1');

    // Free message account and send rent to receiver
    const popTx = await receiverMailbox.makePopTx();

    popTx.feePayer = payer.publicKey;
    const popSig = await conn.sendTransaction(popTx, [payer, receiver]);
    await conn.confirmTransaction(popSig, 'recent');

    // Fetch messages
    messages = await receiverMailbox.fetchMessages();
    assert.ok(messages.length === 0);
  });

  it('Returns rent to original payer', async () => {
    const receiver = anchor.web3.Keypair.generate();

    const payer = anchor.web3.Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    // Get mailbox address
    const [mailbox] = await anchor.web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.mailboxSeed, receiver.publicKey.toBuffer()],
      program.programId,
    );

    // Send first message
    const msgCountBuf0 = Buffer.allocUnsafe(4);
    msgCountBuf0.writeInt32LE(0);
    const [message0] = await anchor.web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.messageSeed, mailbox.toBuffer(), msgCountBuf0],
      program.programId,
    );

    const tx0 = await program.rpc.sendMessage('text0', {
      accounts: {
        mailbox,
        receiver: receiver.publicKey,
        message: message0,
        payer: payer.publicKey,
        sender: payer.publicKey,
        feeReceiver: TREASURY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [payer],
    });
    await conn.confirmTransaction(tx0);

    // close messages
    const oldConsoleLog = console.log;
    const oldConsoleError = console.error;
    console.log = () => {};
    console.error = () => {};
    try {
      const tx1 = await program.rpc.deleteMessage(0, {
        accounts: {
          mailbox,
          receiver: receiver.publicKey,
          authorizedDeleter: receiver.publicKey,
          message: message0,
          rentDestination: receiver.publicKey, // Intentionally wrong
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [receiver],
      });
    } catch (e) {
      assert.ok(
        String(e).startsWith('AnchorError caused by account: rent_destination. Error Code: ConstraintAddress.'),
      );
    }
    console.log = oldConsoleLog;
    console.error = oldConsoleError;
  });

  it('Emits an event when sending', async () => {
    const receiver = anchor.web3.Keypair.generate();

    const payer = anchor.web3.Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(payer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    let eventEmitted = false;
    const eventListener = program.addEventListener('DispatchMessage', async (event, slot) => {
      await program.removeEventListener(eventListener);
      assert.ok(receiver.publicKey.equals(event.receiverPubkey));
      assert.ok(payer.publicKey.equals(event.senderPubkey));
      assert.ok(event.messageIndex === 0);
      assert.ok(event.message === 'text0');
      eventEmitted = true;
    });

    // Get mailbox address
    const [mailbox] = await anchor.web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.mailboxSeed, receiver.publicKey.toBuffer()],
      program.programId,
    );

    // Send first message
    const msgCountBuf0 = Buffer.allocUnsafe(4);
    msgCountBuf0.writeInt32LE(0);
    const [message0] = await anchor.web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.messageSeed, mailbox.toBuffer(), msgCountBuf0],
      program.programId,
    );

    const tx0 = await program.rpc.sendMessage('text0', {
      accounts: {
        mailbox,
        receiver: receiver.publicKey,
        message: message0,
        payer: payer.publicKey,
        sender: payer.publicKey,
        feeReceiver: TREASURY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [payer],
    });
    await conn.confirmTransaction(tx0);

    assert.ok(eventEmitted);
  });

  it('Emits events from the client SDK', async () => {
    const receiverWallet = new anchor.Wallet(anchor.web3.Keypair.generate());
    const senderWallet = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(senderWallet.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const senderMailbox = new Mailbox(conn, senderWallet);
    const receiverMailbox = new Mailbox(conn, receiverWallet);

    const payload = 'Test Message';

    let eventEmitted = false;
    const subscriptionId = receiverMailbox.addMessageListener((message) => {
      receiverMailbox.removeMessageListener(subscriptionId);
      assert.ok(senderWallet.publicKey.equals(message.sender));
      assert.ok(payload === message.data.body);
      eventEmitted = true;
    });

    const tx = await senderMailbox.send(payload, receiverWallet.publicKey);
    await conn.confirmTransaction(tx);

    assert.ok(eventEmitted);
  });

  it('Emits send events from the client SDK', async () => {
    const receiverWallet = new anchor.Wallet(anchor.web3.Keypair.generate());
    const senderWallet = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(senderWallet.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const senderMailbox = new Mailbox(conn, senderWallet);

    const payload = 'Test Message';

    let eventEmitted = false;
    const subscriptionId = senderMailbox.addSentMessageListener((message) => {
      senderMailbox.removeMessageListener(subscriptionId);
      assert.ok(receiverWallet.publicKey.equals(message.receiver));
      assert.ok(0 === message.messageId);
      eventEmitted = true;
    });

    const tx = await senderMailbox.send(payload, receiverWallet.publicKey);
    await conn.confirmTransaction(tx);

    assert.ok(eventEmitted);
  });

  it('Obfuscates in the client library', async () => {
    // Set up accounts
    const receiver = new anchor.Wallet(anchor.web3.Keypair.generate());
    const sender = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(sender.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const senderMailbox = new Mailbox(conn, sender, { sendObfuscated: true });
    const testMessage = 'text0';
    await senderMailbox.send(testMessage, receiver.publicKey);

    const receiverMailbox = new Mailbox(conn, receiver);

    const messageAddress = await receiverMailbox.getMessageAddress(0);
    const messageAccount = await receiverMailbox.messagingProgram.account.message.fetch(messageAddress);
    assert.ok(messageAccount.data !== testMessage);

    const resultingMessage = await receiverMailbox.fetchMessageById(0);
    assert.ok(resultingMessage.data.body === testMessage);
  });

  it('Handles deletes', async () => {
    // Set up accounts
    const receiver = new anchor.Wallet(anchor.web3.Keypair.generate());
    const sender = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(receiver.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(sender.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const receiverMailbox = new Mailbox(conn, receiver);
    const senderMailbox = new Mailbox(conn, sender);

    const testMessages = ['text0', 'text1', 'text2', 'text3', 'text4', 'text5'];
    for (const testMessage of testMessages) {
      await senderMailbox.send(testMessage, receiver.publicKey);
    }

    await conn.confirmTransaction(await receiverMailbox.delete(2));
    await conn.confirmTransaction(await senderMailbox.delete(0, receiver.publicKey));
    await conn.confirmTransaction(await receiverMailbox.delete(1));
    await conn.confirmTransaction(await senderMailbox.delete(4, receiver.publicKey));

    const messages = await receiverMailbox.fetchMessages();
    const messageTexts = messages.map((m) => m.data.body);
    assert.deepEqual(messageTexts, ['text3', 'text5']);

    const { messageCount, readMessageCount } = await receiverMailbox.countEx();
    assert.equal(messageCount, 6);
    assert.equal(readMessageCount, 2);
  });

  it('Sends a message with incentive and accepts it', async () => {
    const receiver = new anchor.Wallet(anchor.web3.Keypair.generate());
    const sender = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(receiver.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(sender.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const mint = await splToken.createMint(conn, sender.payer, sender.publicKey, null, 10);
    const ata = await splToken.createAssociatedTokenAccount(conn, sender.payer, mint, sender.publicKey);
    const tx1 = await splToken.mintTo(conn, sender.payer, mint, ata, sender.payer, 1_000_000_000);
    await conn.confirmTransaction(tx1);

    const receiverMailbox = new Mailbox(conn, receiver);
    const senderMailbox = new Mailbox(conn, sender);

    const incentiveAmount = 500_000;
    const sendOpts = {
      incentive: {
        mint,
        amount: incentiveAmount,
        payerAccount: ata,
      },
    };
    await senderMailbox.send('message with incentive', receiver.publicKey, sendOpts);
    const messageAccount = await receiverMailbox.fetchMessageById(0);
    assert.ok(messageAccount.incentiveMint.equals(mint));
    assert.equal((await receiverMailbox.fetchIncentiveTokenAccount(messageAccount)).amount, BigInt(incentiveAmount));

    let eventEmitted = false;
    const subscriptionId = program.addEventListener('IncentiveClaimed', (event: any, _slot: number) => {
      program.removeEventListener(subscriptionId);
      eventEmitted = true;
      assert.ok(event.senderPubkey.equals(sender.publicKey));
      assert.ok(event.receiverPubkey.equals(receiver.publicKey));
      assert.ok(event.mint.equals(mint));
      assert.equal(event.messageIndex, 0);
      assert.equal(event.amount.toNumber(), incentiveAmount);
    });

    await conn.confirmTransaction(await receiverMailbox.claimIncentive(messageAccount));

    assert.ok(eventEmitted);

    const receiverAtaAddr = await splToken.getAssociatedTokenAddress(mint, receiver.publicKey);
    const receiverAta = await splToken.getAccount(conn, receiverAtaAddr);
    assert.equal(receiverAta.amount, BigInt(incentiveAmount));

    const messageAccountAfter = await receiverMailbox.fetchMessageById(0);
    assert.equal(messageAccountAfter.incentiveMint, undefined);
  });

  it('Sends messages and reads them and deletes them', async () => {
    const receiver = new anchor.Wallet(anchor.web3.Keypair.generate());
    const sender = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(sender.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const senderMailbox = new Mailbox(conn, sender);

    const messagesToSend = ['msg0', 'msg1', 'msg2', 'msg3'];
    for (const msg of messagesToSend) {
      await senderMailbox.send(msg, receiver.publicKey);
    }

    const sentMessages = await senderMailbox.fetchSentMessagesTo(receiver.publicKey);
    assert.equal(sentMessages.length, messagesToSend.length);

    await conn.confirmTransaction(await senderMailbox.deleteMessage(sentMessages[2]));
    const sentMessages2 = await senderMailbox.fetchSentMessagesTo(receiver.publicKey);
    assert.equal(sentMessages2.length, messagesToSend.length - 1);
    const sentMessages2Text = sentMessages2.map((m) => m.data.body);
    assert.deepEqual(sentMessages2Text, ['msg0', 'msg1', 'msg3']);
  });

  it('Sends an enhanced message and fetches it', async () => {
    const receiver = new anchor.Wallet(anchor.web3.Keypair.generate());
    const sender = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(sender.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const senderMailbox = new Mailbox(conn, sender);

    const testSubj = 'test';
    const testBody = 'msg';
    const testMeta = { demo: 'hi' };
    const testNow = new Date().getTime();
    await senderMailbox.sendMessage(testSubj, testBody, receiver.publicKey, {}, testMeta);

    const sentMessage = (await senderMailbox.fetchSentMessagesTo(receiver.publicKey))[0];
    const innerData = sentMessage.data;
    assert.equal(innerData.subj, testSubj);
    assert.equal(innerData.body, testBody);
    assert.ok(innerData.ts.getTime() >= testNow && innerData.ts.getTime() < testNow + 10);
    assert.deepEqual(innerData.meta, testMeta);
  });

  it('Sends a message with sol incentive and accepts it', async () => {
    const receiver = new anchor.Wallet(anchor.web3.Keypair.generate());
    const sender = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(receiver.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(sender.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const receiverMailbox = new Mailbox(conn, receiver);
    const senderMailbox = new Mailbox(conn, sender);

    const mint = splToken.NATIVE_MINT;
    const ata = await splToken.getAssociatedTokenAddress(mint, sender.publicKey);

    const incentiveAmount = 500_000;
    const sendOpts = {
      incentive: {
        mint,
        amount: incentiveAmount,
        payerAccount: ata,
      },
    };

    const sendTx = new anchor.web3.Transaction();
    if (!(await conn.getAccountInfo(ata))) {
      sendTx.add(splToken.createAssociatedTokenAccountInstruction(sender.publicKey, ata, sender.publicKey, mint));
    }
    sendTx.add(
      anchor.web3.SystemProgram.transfer({ fromPubkey: sender.publicKey, toPubkey: ata, lamports: incentiveAmount }),
    );
    sendTx.add(splToken.createSyncNativeInstruction(ata));
    sendTx.add(await senderMailbox.makeSendTx('message with incentive', receiver.publicKey, sendOpts));

    const tx1 = await conn.sendTransaction(sendTx, [sender.payer]);
    await conn.confirmTransaction(tx1);

    const tokenAccount = await splToken.getAccount(conn, ata);
    assert.equal(tokenAccount.amount, BigInt(0));

    await conn.confirmTransaction(await receiverMailbox.claimIncentive(await receiverMailbox.fetchMessageById(0)));
    const receiverAtaAddr = await splToken.getAssociatedTokenAddress(mint, receiver.publicKey);
    const receiverAta = await splToken.getAccount(conn, receiverAtaAddr);
    assert.equal(receiverAta.amount, BigInt(incentiveAmount));
  });

  it('Sends a deprecated message and fetches it', async () => {
    const receiver = new anchor.Wallet(anchor.web3.Keypair.generate());
    const sender = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(sender.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const senderMailbox = new Mailbox(conn, sender);
    const receiverMailbox = new Mailbox(conn, receiver);

    const message = 'test';
    await senderMailbox.send(message, receiver.publicKey);

    const sentMessage = (await receiverMailbox.fetch())[0];
    assert.equal(sentMessage.data, message);
  });
});

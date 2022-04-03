import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as web3 from '@solana/web3.js';
import * as bs58 from 'bs58';
import { Mailbox, KeyPairWallet } from "../src/";

const getSender = () : web3.Keypair => {
  if (process.env.WALLET_SECRET_KEY) {
    const walletSecretKey = process.env.WALLET_SECRET_KEY;
    return web3.Keypair.fromSecretKey(bs58.decode(walletSecretKey));
  }
  const walletFile = process.env.WALLET_FILE || path.join(os.homedir(), '.config', 'solana', 'id.json');
  const secretKeyString = fs.readFileSync(walletFile, 'utf-8');
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return web3.Keypair.fromSecretKey(secretKey);
};

const conn = new web3.Connection(web3.clusterApiUrl('devnet'));
// const sender = getSender();
const sender = web3.Keypair.generate();
const receiver = web3.Keypair.generate();
const senderWallet = new KeyPairWallet(sender);
const receiverWallet = new KeyPairWallet(receiver)
const senderMailbox = new Mailbox(conn, senderWallet);
const receiverMailbox = new Mailbox(conn, receiverWallet);

console.log('receiver', receiver.publicKey.toBase58());
console.log('sender', sender.publicKey.toBase58());

describe("Test for initial Mailbox setup.", () => {
  describe("mailboxTest", () => {
    test("Mailbox Send, receive, pop test", async () => {
      await conn.confirmTransaction(await conn.requestAirdrop(receiver.publicKey, 2 * web3.LAMPORTS_PER_SOL));
      await conn.confirmTransaction(await conn.requestAirdrop(sender.publicKey, 2 * web3.LAMPORTS_PER_SOL));

      console.log('Send message 1');
      const txSig0 = await senderMailbox.send("text0", receiver.publicKey);
      await conn.confirmTransaction(txSig0, 'finalized');

      console.log('Send message 2');
      const txSig1 = await senderMailbox.send("text1", receiver.publicKey);
      await conn.confirmTransaction(txSig1, 'finalized');

      // console.log('Fetch messages from mailbox');
      // let messages = await receiverMailbox.fetch();
      // expect(messages.length).toEqual(2);

      console.log('Fetch sent messages to receiver from senders mailbox');
      let sentMessages = await senderMailbox.fetchSent(receiver.publicKey);
      console.log('1. sentMessages: (should be 2)', sentMessages);

      console.log('Fetch sent messages to receiver from senders mailbox');
      let sentMessages_ = await senderMailbox.fetchSent(sender.publicKey);
      console.log('2. sentMessages_ (should be 0 since theres no messages in this account):', sentMessages_);


      // expect(messages[0].sender.equals(sender.publicKey))
      // expect(messages[0].data).toEqual("text0");

      // expect(messages[1].sender).toEqual(sender.publicKey);
      // expect(messages[1].data).toEqual("text1");

      // console.log('Pop 1 message from mailbox');
      // const txSig2 = await receiverMailbox.pop();
      // await conn.confirmTransaction(txSig2, 'finalized');

      // let _messages = await receiverMailbox.fetch();
      // expect(_messages.length).toEqual(1);

      // expect(_messages[0].sender).toEqual(sender.publicKey);
      // expect(_messages[0].data).toEqual("text1");

      // console.log('Pop 1 message from mailbox');
      // const txSig3 = await receiverMailbox.pop();
      // await conn.confirmTransaction(txSig3, 'finalized');

      // let __messages = await receiverMailbox.fetch();
      // expect(__messages.length).toEqual(0);

    });
  });
});

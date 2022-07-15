import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as web3 from '@solana/web3.js';
import * as bs58 from 'bs58';
import { Mailbox, KeyPairWallet } from "../src/";
import { getMintsForOwner, getMetadataForOwner } from '../src/utils';

const getPayer = () : web3.Keypair => {
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
const payer = getPayer();
const receiver = web3.Keypair.generate();
const payerWallet = new KeyPairWallet(payer);
const receiverWallet = new KeyPairWallet(receiver)
const senderMailbox = new Mailbox(conn, payerWallet);
const receiverMailbox = new Mailbox(conn, receiverWallet);


const OTSender = web3.Keypair.generate();
const OTReceiver = web3.Keypair.generate();
const OTSenderWallet = new KeyPairWallet(OTSender)
const OTReceiverWallet = new KeyPairWallet(OTReceiver);
const OTSenderMailbox = new Mailbox(conn, OTSenderWallet, {sendObfuscated:true});
const OTReceiverMailbox = new Mailbox(conn, OTReceiverWallet, {sendObfuscated:true});
const OTReceiverMailboxAsSender = new Mailbox(conn, OTSenderWallet, {
  sendObfuscated:true,
  mailboxOwner: OTReceiver.publicKey
})

console.log('receiver', receiver.publicKey.toBase58());
console.log('payer', payer.publicKey.toBase58());

describe("Test for initial Mailbox setup.", () => {
  describe("mailboxTest", () => {
    test("Obfuscated mailbox send and receive", async () => {
      await conn.confirmTransaction(await conn.requestAirdrop(OTReceiver.publicKey, 2 * web3.LAMPORTS_PER_SOL));
      await conn.confirmTransaction(await conn.requestAirdrop(OTSender.publicKey, 2 * web3.LAMPORTS_PER_SOL));

      console.log('Send obf message 1 from Sender to Receiver');
      const txSig0 = await OTSenderMailbox.send("obftext0", OTReceiver.publicKey);
      await conn.confirmTransaction(txSig0, 'finalized');

      console.log('Fetch messages from Receivers mailbox as sender');
      let messages = await OTReceiverMailboxAsSender.fetch();
      console.log(messages);
      expect(messages.length).toEqual(1);
      expect(messages[0].data).toEqual("obftext0");


    });

    test("Mailbox Send, receive, pop test", async () => {
      await conn.confirmTransaction(await conn.requestAirdrop(receiver.publicKey, 2 * web3.LAMPORTS_PER_SOL));

      console.log('Send message 1');
      const txSig0 = await senderMailbox.send("text0", receiver.publicKey);
      await conn.confirmTransaction(txSig0, 'finalized');

      console.log('Send message 2');
      const txSig1 = await senderMailbox.send("text1", receiver.publicKey);
      await conn.confirmTransaction(txSig1, 'finalized');

      console.log('Fetch messages from mailbox');
      let messages = await receiverMailbox.fetch();
      expect(messages.length).toEqual(2);

      expect(messages[0].sender.equals(payer.publicKey))
      expect(messages[0].data).toEqual("text0");

      expect(messages[1].sender).toEqual(payer.publicKey);
      expect(messages[1].data).toEqual("text1");

      console.log('Pop 1 message from mailbox');
      const txSig2 = await receiverMailbox.pop();
      await conn.confirmTransaction(txSig2, 'finalized');

      let _messages = await receiverMailbox.fetch();
      expect(_messages.length).toEqual(1);

      expect(_messages[0].sender).toEqual(payer.publicKey);
      expect(_messages[0].data).toEqual("text1");

      console.log('Pop 1 message from mailbox');
      const txSig3 = await receiverMailbox.pop();
      await conn.confirmTransaction(txSig3, 'finalized');

      let __messages = await receiverMailbox.fetch();
      expect(__messages.length).toEqual(0);

    });
  });
});

describe('Test helper functions', () => {
  test('Get mints for user', async () => {
    // Use mainnet for looking up people's tokens
    const conn = new web3.Connection(web3.clusterApiUrl('mainnet-beta'));

    // A trash panda holder I found. TODO replace this with a
    // test wallet under our control
    const publicKey = new web3.PublicKey('7ycUFfnspMwnjp2DfSjAvZgf7g7T6nugrGv2kpzogrNC');

    const mints = await getMintsForOwner(conn, publicKey);

    // Make sure our mints are correct
    expect(mints).toEqual(
      expect.arrayContaining([
        new web3.PublicKey('9pSeEsGdnHCdUF9328Xdn88nMmzWUSLAVEC5dWgPvM3Q'),
        new web3.PublicKey('DTPMARh15YSqggNbMLECj8RxVoxfhtobyyCLiwEeVwZu')
      ])
    );

    // Now, get the Metadata for the user...
    // And assert that it owns an item in the trash panda
    // collection
    const metadata = await getMetadataForOwner(conn, publicKey);
    expect(metadata.some(({ collection }) => {
      return (
        collection &&
        collection.verified === true &&
        collection.key.toBase58() === 'GoLMLLR6iSUrA6KsCrFh7f45Uq5EHFQ3p8RmzPoUH9mb'
      );
    })).toBe(true);
  });
});

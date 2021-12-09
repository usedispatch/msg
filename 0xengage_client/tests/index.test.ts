import { Keypair, clusterApiUrl } from '@solana/web3.js';
import * as web3 from '@solana/web3.js';
import * as bs58 from 'bs58';
import { Mailbox } from "../src/";


const walletSecretKey = process.env.WALLET_SECRET_KEY!;
const conn = new web3.Connection(web3.clusterApiUrl('devnet'));
const payer = Keypair.fromSecretKey(bs58.decode(walletSecretKey));
const receiver = Keypair.generate();
const mailbox = new Mailbox(conn, {
    receiver, payer,
});

console.log('receiver', receiver.publicKey.toBase58());
console.log('payer', payer.publicKey.toBase58());

describe("Test for initial Mailbox setup.", () => {
    describe("mailboxTest", () => {
        test("Mailbox Send, receive, pop test", async () => {

            console.log('Send message 1');
            const txSig0 = await mailbox.send("text0");
            await conn.confirmTransaction(txSig0, 'finalized');

            console.log('Send message 2');
            const txSig1 = await mailbox.send("text1");
            await conn.confirmTransaction(txSig1, 'finalized');

            console.log('Fetch messages from mailbox');
            let messages = await mailbox.fetch();
            expect(messages.length).toEqual(2);

            expect(messages[0].sender.equals(payer.publicKey))
            expect(messages[0].data).toEqual("text0");

            expect(messages[1].sender).toEqual(payer.publicKey);
            expect(messages[1].data).toEqual("text1");

            console.log('Pop 1 message from mailbox');
            const txSig2 = await mailbox.pop();
            await conn.confirmTransaction(txSig2, 'finalized');

            let _messages = await mailbox.fetch();
            expect(_messages.length).toEqual(1);

            expect(_messages[0].sender).toEqual(payer.publicKey);
            expect(_messages[0].data).toEqual("text1");

            console.log('Pop 1 message from mailbox');
            const txSig3 = await mailbox.pop();
            await conn.confirmTransaction(txSig3, 'finalized');

            let __messages = await mailbox.fetch();
            expect(__messages.length).toEqual(0);

        });
    });
});

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

        test("Mailbox init", async () => {
            console.log(`wallet secret key ${walletSecretKey}`);

            // Something to make this run
            // const received = "Hello World!";
            // const expected = "Hello World!";
            // expect(received).toBe(expected);

            // Actual test starts here

            await mailbox.send("text0");
            await mailbox.send("text1");

            let messages = await mailbox.fetch();
            // expect(messages.length).toEqual(2);

            // expect(messages[0].sender.equals(payer.publicKey))
            // assert.ok(messages[0].data === "text0");

            // assert.ok(messages[1].sender.equals(payer.publicKey))
            // assert.ok(messages[1].data === "text1");

            // await mailbox.pop();
            // messages = await mailbox.fetch();
            // assert.ok(messages.length === 1);

            // assert.ok(messages[0].sender.equals(payer.publicKey))
            // assert.ok(messages[0].data === "text1");

            // await mailbox.pop();
            // messages = await mailbox.fetch();
            // assert.ok(messages.length === 0);

        });
    });
});

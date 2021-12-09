import { Keypair, clusterApiUrl } from '@solana/web3.js';
import * as web3 from '@solana/web3.js';
import * as bs58 from 'bs58';
import { Mailbox } from "../src/";


const walletSecretKey = process.env.WALLET_SECRET_KEY!;
const conn = new web3.Connection(web3.clusterApiUrl('devnet'));
const payer = Keypair.fromSecretKey(bs58.decode(walletSecretKey));
const receiver = Keypair.generate();


describe("Test for initial Jest setup.", () => {
    describe("practiceTest", () => {
        test("Given 'Hello World!', return 'Hello World!'", async () => {
            console.log(`wallet secret key ${walletSecretKey}`);
            const received = "Hello World!";
            const expected = "Hello World!";
            expect(received).toBe(expected);

            console.log('receiver', receiver.publicKey);
            console.log('payer', payer.publicKey);

            const mailbox = new Mailbox(conn, {
                receiver, payer,
            });

            await mailbox.send("text0");
            await mailbox.send("text1");


        });
    });

});

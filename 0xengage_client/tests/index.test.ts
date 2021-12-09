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


describe("Test for initial Mailbox setup.", () => {
    describe("mailboxTest", () => {

        test("Mailbox init", async () => {
            console.log(`wallet secret key ${walletSecretKey}`);

            // Something to make this run
            const received = "Hello World!";
            const expected = "Hello World!";
            expect(received).toBe(expected);

            // Actual test starts here
            console.log('receiver', receiver.publicKey);
            console.log('payer', payer.publicKey);

            // await conn.confirmTransaction(
            //     await conn.requestAirdrop(payer.publicKey,
            //                               2 * web3.LAMPORTS_PER_SOL))


            await mailbox.send("text0");
            await mailbox.send("text1");
        });
    });
});

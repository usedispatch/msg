import * as anchor from '@project-serum/anchor';
import { DispatchConnection, WalletInterface  } from '../usedispatch_client/src';
// import * as fs from 'fs';
// import { PublicKey } from '@solana/web3.js';
import { Postbox } from '../target/types/postbox';
import postboxProgramIdl from '../target/idl/postbox.json';
async function main() {
    const connection = new anchor.web3.Connection("https://special-quaint-needle.solana-mainnet.quiknode.pro/e595d0072cc6ba40bc075ed8e030b7a4c53b3ff1/", "confirmed"); 
    const anchorWallet = new anchor.Wallet(anchor.web3.Keypair.generate());
    anchor.setProvider(new anchor.AnchorProvider(connection, anchorWallet, { preflightCommitment: 'confirmed' }));
    // const wallet = {
    //   wallet: anchorWallet,
    //   sendTransaction: anchorWallet.signTransaction,
    //   signTransaction: anchorWallet.signTransaction,
    //   signAllTransactions: anchorWallet.signAllTransactions,
    //   publicKey: anchorWallet.publicKey,
    // }
    // const dispatchConnection = new DispatchConnection(connection, wallet, {skipAnchorProvider: true});
    const postboxProgramID = new anchor.web3.PublicKey("DHepkufWDLJ9DCD37nbEDbPSFKjGiziQ6Lbgo1zgGX7S");
    const postboxProgram = new anchor.Program<Postbox>(postboxProgramIdl as Postbox, postboxProgramID);
    const signatures = await connection.getSignaturesForAddress(postboxProgramID)
    const transactions = await connection.getParsedTransactions(signatures.map((sig) => sig.signature))
    // const accounts = await connection.getParsedProgramAccounts(new anchor.web3.PublicKey("DHepkufWDLJ9DCD37nbEDbPSFKjGiziQ6Lbgo1zgGX7S"))
    // // dispatchConnection.postboxProgram.
    // let postboxAddresses = {
    //   "pubkeys": [] as PublicKey[]
    // }
    // accounts.map((account) => {
    //   postboxAddresses.pubkeys.push(new PublicKey(account.pubkey))
    //     postboxAddresses.pubkeys.push(new PublicKey(account.pubkey.toBase58()))
    //     })
    // console.log(accounts);
    // const postboxAccountInfo = await connection.getParsedAccountInfo(new anchor.web3.PublicKey("6xcCdQfJre5PPDqPZGRvvSUiybTjwXBEKLFdeBhKGoT3"))
    // const account = await postboxProgram.account.postbox.fetch(new anchor.web3.PublicKey("6xcCdQfJre5PPDqPZGRvvSUiybTjwXBEKLFdeBhKGoT3"));
    // console.log(account.settings)

    transactions.map((txn) => {
      console.log(txn.transaction.message.instructions)
      if ((txn.meta.loadedAddresses?.readonly.length + txn.meta.loadedAddresses?.writable.length) > 8) {
        // let readOnlyAddresses = txn.meta.loadedAddresses
        let loadedAddresses = txn.meta.loadedAddresses;
        console.log(loadedAddresses)
        // console.log(txn.meta.loadedAddresses)
      }
    })
  }

main();     

// list of hashmaps, key - account address, value - account info
// store title

// settings account on chain should have target.key
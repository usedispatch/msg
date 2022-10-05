import * as anchor from '@project-serum/anchor';
import { DispatchConnection, WalletInterface  } from '../usedispatch_client/src';
// import { PublicKey } from '@solana/web3.js';
import { Postbox } from '../target/types/postbox';
import postboxProgramIdl from '../target/idl/postbox.json';
// import postboxProgramIdl from '../postbox.json';
import { createClient } from '@supabase/supabase-js'
//uncomment when forumMapping.json is ready
import forumMapping from '../forumMapping.json';

//uncomment when forumMappingWithChildId.json is ready
import forumMappingWithMaxChildId from '../forumMappingWithMaxChildId.json';

const SUPABASE_URL = 'https://aiqrzujttjxgjhumjcky.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpcXJ6dWp0dGp4Z2podW1qY2t5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY2MTQ3MDk2OCwiZXhwIjoxOTc3MDQ2OTY4fQ.mRlv8Yih9mbKSNr3PAEm60bwq2RDTkAKTzZ-ScPYdWg';
  
const connection = new anchor.web3.Connection("https://special-quaint-needle.solana-mainnet.quiknode.pro/e595d0072cc6ba40bc075ed8e030b7a4c53b3ff1/", "confirmed"); 
const anchorWallet = new anchor.Wallet(anchor.web3.Keypair.generate());
anchor.setProvider(new anchor.AnchorProvider(connection, anchorWallet, { preflightCommitment: 'confirmed' }));

const postboxProgramID = new anchor.web3.PublicKey("DHepkufWDLJ9DCD37nbEDbPSFKjGiziQ6Lbgo1zgGX7S");
const postboxProgram = new anchor.Program<Postbox>(postboxProgramIdl as Postbox, postboxProgramID);


async function getPostboxIDs() {

    const postboxProgramID = new anchor.web3.PublicKey("DHepkufWDLJ9DCD37nbEDbPSFKjGiziQ6Lbgo1zgGX7S");
    const postboxProgram = new anchor.Program<Postbox>(postboxProgramIdl as Postbox, postboxProgramID);
    const coder = new anchor.BorshCoder(postboxProgramIdl as Postbox);
    const signatures = await connection.getSignaturesForAddress(postboxProgramID)
    const transactions = await connection.getParsedTransactions(signatures.map((sig) => sig.signature))
    const forumMapping: { postboxID: string; forumID: string; }[] = []
    console.log(transactions)
    transactions.map((txn) => {
      const txnData = txn.transaction;
      const txnMsg = txnData.message;
      const txnInstructions = txnMsg.instructions;

      const initIx = txnInstructions.filter((instruction) => {
        const ix = instruction as anchor.web3.PartiallyDecodedInstruction
        try {
          const ixData = coder.instruction.decode(ix.data, 'base58');
          if (ixData.name === 'initialize') {
            return true;
          }
        } catch (error) {
          return false;
        }
      })

      initIx.map((instruction) => {
        const ix = instruction as anchor.web3.PartiallyDecodedInstruction
        const inputAccounts = ix.accounts;
        // if (inputAccounts && inputAccounts.length == 8) {
        console.log(inputAccounts[2].toBase58())
        forumMapping.push({ postboxID: inputAccounts[0].toBase58(), forumID: inputAccounts[2].toBase58() })
        // } 
      })
    
    
    })
    return forumMapping;
  }


  // get account info for each postbox in forumMapping.json
async function getMaxChildId() {

  // const forumMaxChildID: { postboxID: string; forumID: string; maxChildID: number}[] = []

  const postboxIDs = await Promise.all( forumMapping.map(async (forum) => {
    try {
      
      const account = await postboxProgram.account.postbox.fetch(forum.postboxID); // .fetch(new anchor.web3.PublicKey(forum.postboxID) );
      const maxID = account.maxChildId
      // console.log(account)
      if (account.maxChildId >= 0) {
        const data = { postboxID: forum.postboxID, forumID: forum.forumID, maxChildID: maxID }
        // console.log(data)
        return data
      }
      // console.log(accounts);
    } catch (error) {
      // console.log(forum.postboxID)
      return false;
    }
    return new anchor.web3.PublicKey(forum.postboxID)
  }, []));
  const filteredPostboxes = postboxIDs.filter((postbox) => {
    return postbox !== false
  })
  // console.log(filteredPostboxes.length)
  return JSON.stringify(filteredPostboxes);
}

async function uploadToSupabase() {
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {schema: 'protected'})

  // const test = await supabase.from('postbox_post_id_mainnet').insert([ { postbox_id: 'test', forum_id: 'test', max_child_id: 0 } ]).then((res) => {
  //   console.log(res.body)
  // })
  forumMappingWithMaxChildId.map(async (forum: {postboxID: string, forumID: string, maxChildID: number}) => {
    await supabase.from('postbox_post_id_mainnet').update([ { max_child_id: forum.maxChildID } ]).match({ forum_id: forum.forumID }).then((res) => {
      if (res.error) {
        console.log(forum.forumID)
      }
    })
  })
  // console.log(test)
}

async function main() {
  // run yarn ts-node > forumMapping.json
  // const map = await getPostboxIDs();
  // console.log(map.length)
  // run yarn ts-node > forumMaxChildID.json
  // const maxChildID = await getMaxChildId();
  // console.log(maxChildID);
  await uploadToSupabase();
}
main();     
// getMaxChildId().then((res) => console.log(res));
// list of hashmaps, key - account address, value - account info
// store title

// settings account on chain should have target.key

      // console.log(txn.transaction.message.instructions)
      // if (txn.meta.loadedAddresses) {
      //   const totalAccounts = txn.meta.loadedAddresses.readonly.length + txn.meta.loadedAddresses.writable.length
      // }
      // if ((txn.meta.loadedAddresses?.readonly.length + txn.meta.loadedAddresses?.writable.length) >= 1) {
        // let readOnlyAddresses = txn.meta.loadedAddresses
        // let loadedAddresses = txn.meta.loadedAddresses.;
        // console.log(loadedAddresses)
        // // console.log(txn.meta.loadedAddresses)
      // }

      // instruction -> account data -> database
      // get all instructions and parse 8 accounts to find initialized postbox
      // store forum id and postbox id
      // file 2 adds a field to above with max child ID.
      // last step is to populate databse
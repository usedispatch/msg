import * as anchor from '@project-serum/anchor';
import * as splToken from '@solana/spl-token';

import {
    DispatchConnection,
    Forum
  } from "./src";

const TRANSACTION_TIMEOUT = 500;
const COLLECTION_ID = "Fs5wSa7GYtTqivXGqHyx673v5oPuD5Cb7ij9utsFKdLb" // dispatch dev forum
const TOPIC_DATA = { 
    subj: "scripted topic",
    body: "this is a scripted topic"
}
async function main() {
    console.log("Starting using collection id: ", COLLECTION_ID);
    const connection = new anchor.web3.Connection("http://api.devnet.solana.com", "confirmed"); 
    const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
    const dispatchConnection = new DispatchConnection(connection, wallet);

    const collectionKey = new anchor.web3.PublicKey(COLLECTION_ID);
    const dispatchForum = new Forum(dispatchConnection, collectionKey);

    await connection.confirmTransaction(await connection.requestAirdrop(wallet.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    console.log("airdrop complete")
    // create topic
    await dispatchForum.createTopic(TOPIC_DATA);
    console.log("topic created")
    const topics = await dispatchForum.getTopicsForForum();
    const topicPost = topics[0]
    console.log("topic post created at ID: ", topicPost.postId, topicPost);
    
    console.log('Start Posts')
    for (let i = 0; i < 100; i++) {
        const postData = {body: `p${i}`}
        let postTxn = await dispatchForum.createForumPost(postData, topicPost);
        console.log("created post", TOPIC_DATA, postTxn)
        let posts = await dispatchForum.getTopicMessages(topicPost);
        let lastPost = posts[posts.length - 1]
        await new Promise(f => setTimeout(f, TRANSACTION_TIMEOUT));
        const replyData = {body: `r1`}
        let replyTxn = await dispatchForum.replyToForumPost(lastPost, replyData);
        console.log("created reply", TOPIC_DATA, replyTxn)
        await new Promise(f => setTimeout(f, TRANSACTION_TIMEOUT));
    }
}

main()
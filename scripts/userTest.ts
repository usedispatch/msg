import * as anchor from '@project-serum/anchor';


import {
    DispatchConnection,
    Forum,
    ForumPost
  } from "../usedispatch_client/src";

const TRANSACTION_TIMEOUT = 500;
const COLLECTION_ADDRESS = "8gbq3z1ySWYNt7GDZrnr8CAxCfsvtQSsZr2NuGu5DWB7" // stress test forum
const NUMBER_OF_TOPICS = 1;
const NUMBER_OF_POSTS = 500

//custom topic data
const TOPIC_ID = 136
const TOPIC_ADDRESS = "H98AqMzvsssyoA5qWEjVSwGhyFWbF3nd2AHWEr5aESY1"
const TOPIC_POSTER = "9X8tGwnZcfmmchJpXi3j7ENVvVD919prYSzMGudhFava"
const TOPIC_DATE = "2022-08-11T05:18:04.000Z"

const TOPIC_DATA = { 
    subj: "scripted topic",
    body: "this is a scripted topic"
}


async function main() {
    console.log("Starting using collection id: ", COLLECTION_ADDRESS);
    const connection = new anchor.web3.Connection("http://api.devnet.solana.com", "confirmed"); 
    const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
    const dispatchConnection = new DispatchConnection(connection, wallet);

    const collectionKey = new anchor.web3.PublicKey(COLLECTION_ADDRESS);
    const dispatchForum = new Forum(dispatchConnection, collectionKey);

    const TOPIC_POST = {
        parent: {
            dispatch: dispatchConnection,
            target: {}
        }, 
        address: new anchor.web3.PublicKey(TOPIC_ADDRESS),
        postId: TOPIC_ID,
        poster: new anchor.web3.PublicKey(TOPIC_POSTER),
        data: {
            subj: 'scripted topic',
            body: 'this is a scripted topic',
            ts: new Date(TOPIC_DATE),
            meta: { topic: true }
        },
        isTopic: true,
    } as ForumPost


    await connection.confirmTransaction(await connection.requestAirdrop(wallet.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    console.log("airdrop complete")
    // create topic
    for (let i = 0; i < NUMBER_OF_TOPICS; i++) {
        // const solBalance = await connection.getBalance(wallet.publicKey)
        // console.log(solBalance)
        // if ( solBalance < 10000) {
        //     await connection.confirmTransaction(await connection.requestAirdrop(wallet.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
        // }

        // comment lines below to use custom topic above
        // await dispatchForum.createTopic(TOPIC_DATA);
        // console.log("topic created")
        // const topics = await dispatchForum.getTopicsForForum();
        // const TOPIC_POST = topics[0]
        // console.log(TOPIC_POST.parent, TOPIC_POST.address.toBase58(), TOPIC_POST.poster.toBase58())
        // console.log("topic post created at ID: ", TOPIC_POST.postId);
    
        console.log('Start Posts')
        for (let i = 0; i < NUMBER_OF_POSTS/2; i++) {
            const postData = {body: `p${i}`}
            let postTxn = await dispatchForum.createForumPost(postData, TOPIC_POST);
            await connection.confirmTransaction(postTxn, "finalized");
            console.log("created post", postTxn)
            let posts = await dispatchForum.getTopicMessages(TOPIC_POST);
            let lastPost = posts[posts.length - 1]
            // await new Promise(f => setTimeout(f, TRANSACTION_TIMEOUT));
            const replyData = {body: `r1`}
            let replyTxn = await dispatchForum.replyToForumPost(lastPost, replyData);
            await connection.confirmTransaction(replyTxn, "finalized");
            console.log("created reply", replyData, replyTxn)
            // await new Promise(f => setTimeout(f, TRANSACTION_TIMEOUT));

        }
    }
}

main()
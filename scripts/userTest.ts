import * as anchor from '@project-serum/anchor';

import { DispatchConnection, Forum, ForumPost } from '../usedispatch_client/src';

const TRANSACTION_TIMEOUT = 500;
const COLLECTION_ID = 'Fs5wSa7GYtTqivXGqHyx673v5oPuD5Cb7ij9utsFKdLb'; // dispatch dev forum
const TOPIC_DATA = {
  subj: 'scripted topic',
  body: 'this is a scripted topic',
};

async function main() {
  console.log('Starting using collection id: ', COLLECTION_ID);
  const connection = new anchor.web3.Connection('http://api.devnet.solana.com', 'confirmed');
  const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
  const dispatchConnection = new DispatchConnection(connection, wallet);

  const collectionKey = new anchor.web3.PublicKey(COLLECTION_ID);
  const dispatchForum = new Forum(dispatchConnection, collectionKey);

  const TOPIC_POST = {
    parent: {
      dispatch: dispatchConnection,
      target: {},
    },
    address: new anchor.web3.PublicKey('GixW8PFnhLxs9yJEbcfZzZrk66HwXAtcPFHx6JapdaQ5'),
    postId: 86,
    poster: new anchor.web3.PublicKey('iDPqXWr1KeDNUHQFmjuckjNgyfwtRhe2bcDvWBao5XY'),
    data: {
      subj: 'scripted topic',
      body: 'this is a scripted topic',
      ts: new Date('2022-08-01T20:34:32.000Z'),
      meta: { topic: true },
    },
    isTopic: true,
  } as ForumPost;

  await connection.confirmTransaction(
    await connection.requestAirdrop(wallet.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
  );
  console.log('airdrop complete');
  // create topic
  // await dispatchForum.createTopic(TOPIC_DATA);
  // console.log("topic created")
  // const topics = await dispatchForum.getTopicsForForum();
  // const topicPost = topics[0]
  // console.log(topicPost.parent, topicPost.address.toBase58(), topicPost.poster.toBase58())
  // console.log("topic post created at ID: ", topicPost.postId, topicPost);

  console.log('Start Posts');
  for (let i = 0; i < 100; i++) {
    const postData = { body: `p${i}` };
    const postTxn = await dispatchForum.createForumPost(postData, TOPIC_POST);
    console.log('created post', postData, postTxn);
    const posts = await dispatchForum.getTopicMessages(TOPIC_POST);
    const lastPost = posts[posts.length - 1];
    await new Promise((f) => setTimeout(f, TRANSACTION_TIMEOUT));
    const replyData = { body: `r1` };
    const replyTxn = await dispatchForum.replyToForumPost(lastPost, replyData);
    console.log('created reply', replyData, replyTxn);
    await new Promise((f) => setTimeout(f, TRANSACTION_TIMEOUT));
  }
}

main();

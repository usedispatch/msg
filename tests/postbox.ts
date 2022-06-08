import * as anchor from '@project-serum/anchor';
import { strict as assert } from 'assert';

import { Postbox, DispatchConnection, Forum, clusterAddresses } from '../usedispatch_client/src';

describe('postbox', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const conn = anchor.getProvider().connection;
  const TREASURY = clusterAddresses.get("devnet").treasuryAddress;

  it('Initializes a postbox and creates a post', async () => {
    // Set up accounts
    const owner = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(owner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(TREASURY, 1 * anchor.web3.LAMPORTS_PER_SOL));

    const treasuryBalance = await conn.getBalance(TREASURY);

    const postbox = new Postbox(new DispatchConnection(conn, owner), {key: owner.publicKey, str: "Public"});
    const tx0 = await postbox.initialize();
    await conn.confirmTransaction(tx0);

    assert.equal(await conn.getBalance(TREASURY), treasuryBalance + 1_000_000_000);

    const testPost = {subj: "Test", body: "This is a test post"};
    const tx1 = await postbox.createPost(testPost);
    await conn.confirmTransaction(tx1);

    assert.equal(await conn.getBalance(TREASURY), treasuryBalance + 1_000_000_000 + 50_000);

    const posts = await postbox.fetchPosts();
    assert.equal(posts.length, 1);

    const firstPost = posts[0];
    assert.equal(firstPost.data.subj, testPost.subj);
    assert.equal(firstPost.data.body, testPost.body);

    const oldPostAddress = firstPost.address;
    const tx2 = await postbox.deletePost(firstPost);
    await conn.confirmTransaction(tx2);
    await conn.confirmTransaction(tx2);
    const oldPost = await conn.getAccountInfo(oldPostAddress);
    assert.equal(oldPost, null);
  });

  it('Creates a third party postbox', async () => {
    const target = anchor.web3.Keypair.generate().publicKey;
    const owner1 = new anchor.Wallet(anchor.web3.Keypair.generate());
    const owner2 = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(owner1.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const postbox = new Postbox(new DispatchConnection(conn, owner1), {key: target, str: "Public"});
    const tx0 = await postbox.initialize([owner1.publicKey, owner2.publicKey]);
    await conn.confirmTransaction(tx0);

    const owners = await postbox.getOwners();
    assert.equal(owners.length, 2);
    assert.ok(owners[0].equals(owner1.publicKey));
    assert.ok(owners[1].equals(owner2.publicKey));

    const testPost = {subj: "Test", body: "This is a test post"};
    const tx1 = await postbox.createPost(testPost);
    await conn.confirmTransaction(tx1);

    const posts = await postbox.fetchPosts();
    assert.equal(posts.length, 1);
  });

  it('Replies to a post', async () => {
    const owner = new anchor.Wallet(anchor.web3.Keypair.generate());
    const replier = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(owner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(replier.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const postbox = new Postbox(new DispatchConnection(conn, owner), {key: owner.publicKey});
    const tx0 = await postbox.initialize();
    await conn.confirmTransaction(tx0);

    const testPost = {subj: "Test", body: "This is a test post"};
    const tx1 = await postbox.createPost(testPost);
    await conn.confirmTransaction(tx1);

    const posts = await postbox.fetchPosts();
    const replyPost = {body: "This is a reply post"};
    const tx2 = await postbox.replyToPost(replyPost, posts[0]);
    await conn.confirmTransaction(tx2);

    const topLevelPosts = await postbox.fetchPosts();
    assert.equal(topLevelPosts.length, 1);
    const replies = await postbox.fetchReplies(topLevelPosts[0]);
    assert.equal(replies.length, 1);
    assert.ok(replies[0].replyTo.equals(topLevelPosts[0].address))
  });

  it('Designates a moderator who deletes', async () => {
    const owner = new anchor.Wallet(anchor.web3.Keypair.generate());
    const poster = new anchor.Wallet(anchor.web3.Keypair.generate());
    const moderator = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(owner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(poster.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(moderator.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const postboxAsOwner = new Postbox(new DispatchConnection(conn, owner), {key: owner.publicKey});
    const postboxAsPoster = new Postbox(new DispatchConnection(conn, poster), {key: owner.publicKey});
    const postboxAsModerator = new Postbox(new DispatchConnection(conn, moderator), {key: owner.publicKey});
    const tx0 = await postboxAsOwner.initialize();
    await conn.confirmTransaction(tx0);

    const testPost = {subj: "Test", body: "This is a test post"};
    const tx1 = await postboxAsPoster.createPost(testPost);
    await conn.confirmTransaction(tx1);

    const topLevelPosts = await postboxAsOwner.fetchPosts();
    assert.equal(topLevelPosts.length, 1);

    const tx2 = await postboxAsOwner.addModerator(moderator.publicKey);
    await conn.confirmTransaction(tx2);

    const tx3 = await postboxAsModerator.deletePostAsModerator(topLevelPosts[0]);
    await conn.confirmTransaction(tx3);

    const posts = await postboxAsOwner.fetchPosts();
    assert.equal(posts.length, 0);
  });

  it('Allows voting', async () => {
    const owner = new anchor.Wallet(anchor.web3.Keypair.generate());
    const voter = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(owner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(voter.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const postboxAsOwner = new Postbox(new DispatchConnection(conn, owner), {key: owner.publicKey});
    const postboxAsVoter = new Postbox(new DispatchConnection(conn, voter), {key: owner.publicKey});
    const tx0 = await postboxAsOwner.initialize();
    await conn.confirmTransaction(tx0);

    const testPost = {subj: "Test", body: "This is a test post"};
    const tx1 = await postboxAsOwner.createPost(testPost);
    await conn.confirmTransaction(tx1);

    const topLevelPosts = await postboxAsOwner.fetchPosts();
    assert.equal(topLevelPosts.length, 1);

    const treasuryBalance = await conn.getBalance(TREASURY);

    const tx2 = await postboxAsVoter.vote(topLevelPosts[0], true);
    await conn.confirmTransaction(tx2);

    const posts = await postboxAsOwner.fetchPosts();
    assert.equal(posts[0].upVotes, 1);

    assert.equal(await conn.getBalance(TREASURY), treasuryBalance + 50_000);
  });

  it('Uses the forum.ts wrapper', async () => {
    const collectionId = anchor.web3.Keypair.generate().publicKey;

    const owner = new anchor.Wallet(anchor.web3.Keypair.generate());
    const moderator = new anchor.Wallet(anchor.web3.Keypair.generate());
    const poster = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(owner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(moderator.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(poster.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const forumAsOwner = new Forum(new DispatchConnection(conn, owner), collectionId);
    const forumAsModerator = new Forum(new DispatchConnection(conn, moderator), collectionId);
    const forumAsPoster = new Forum(new DispatchConnection(conn, poster), collectionId);

    const descStr = "A forum for the test suite";
    if (!await forumAsOwner.exists()) {
      const txs = await forumAsOwner.createForum({
        collectionId,
        owners: [owner.publicKey],
        moderators: [owner.publicKey],  // We add the moderator below as a test
        title: "Test Forum",
        description: descStr,
      });
      await Promise.all(txs.map((t) => conn.confirmTransaction(t)));
    }

    const owners = await forumAsOwner.getOwners();
    assert.ok(owners[0].equals(owner.publicKey));
    const desc = await forumAsOwner.getDescription();
    assert.equal(desc.title, "Test Forum");
    assert.equal(desc.desc, descStr);
    assert.ok(await forumAsOwner.isOwner());

    const txA = await forumAsOwner.setDescription({title: "Test", desc: descStr});
    await conn.confirmTransaction(txA);
    const desc2 = await forumAsOwner.getDescription();
    assert.equal(desc2.title, "Test");

    const txB = await forumAsOwner.addModerator(moderator.publicKey);
    await conn.confirmTransaction(txB);
    assert.ok(await forumAsModerator.isModerator());

    const moderators = await forumAsOwner.getModerators();
    assert.equal(moderators.length, 2);
    assert.ok(moderators.map((m) => m.toBase58()).includes(moderator.publicKey.toBase58()));

    const topic0 = {subj: "Test Topic", body: "This is a test topic."};
    const tx0 = await forumAsPoster.createTopic(topic0);
    await conn.confirmTransaction(tx0);

    const topics = await forumAsPoster.getTopicsForForum();
    assert.equal(topics.length, 1);

    const testPost0 = {subj: "Test", body: "This is a test post"};
    const tx1 = await forumAsPoster.createForumPost(testPost0, topics[0]);
    await conn.confirmTransaction(tx1);

    const testPost1 = {subj: "Spam", body: "This is a spam post"};
    const tx2 = await forumAsPoster.createForumPost(testPost1, topics[0]);
    await conn.confirmTransaction(tx2);

    let topicPosts = await forumAsModerator.getTopicMessages(topics[0]);
    assert.equal(topicPosts.length, 2);

    const delTxs = (await Promise.all(topicPosts.map(async (p) => {
      if ((p.data.subj ?? "") === "Spam") {
        return await forumAsModerator.deleteForumPost(p, true);
      }
      return null;
    }))).filter((t) => t !== null);
    await Promise.all(delTxs.map((t) => conn.confirmTransaction(t)));

    topicPosts = await forumAsPoster.getTopicMessages(topics[0]);
    assert.equal(topicPosts.length, 1);

    const tx3 = await forumAsPoster.deleteForumPost(topicPosts[0]);
    await conn.confirmTransaction(tx3);

    topicPosts = await forumAsOwner.getTopicMessages(topics[0]);
    assert.equal(topicPosts.length, 0);

    const testPost2 = {subj: "Test2", body: "Another test"};
    const tx4 = await forumAsPoster.createForumPost(testPost2, topics[0]);
    await conn.confirmTransaction(tx4);

    const posts = await forumAsModerator.getTopicMessages(topics[0]);
    const tx5 = await forumAsModerator.voteUpForumPost(posts[0]);
    await conn.confirmTransaction(tx5);

    const postsAgain = await forumAsModerator.getTopicMessages(topics[0]);
    assert.equal(postsAgain[0].upVotes, 1);

    const replyPost = {subj: "Reply", body: "Testing reply"};
    const tx6 = await forumAsModerator.replyToForumPost(postsAgain[0], replyPost);
    await conn.confirmTransaction(tx6);

    const replies = await forumAsModerator.getReplies(postsAgain[0]);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].data.subj, "Reply");
  });
});

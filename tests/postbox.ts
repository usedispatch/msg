import * as anchor from '@project-serum/anchor';
import { strict as assert } from 'assert';

import { Postbox } from '../usedispatch_client/src';

describe('postbox', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const conn = anchor.getProvider().connection;

  it('Initializes a postbox and creates a post', async () => {
    // Set up accounts
    const owner = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(owner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const postbox = new Postbox(conn, owner, {key: owner.publicKey});
    const tx0 = await postbox.initialize();
    await conn.confirmTransaction(tx0);

    const testPost = {subj: "Test", body: "This is a test post"};
    const tx1 = await postbox.createPost(testPost);
    await conn.confirmTransaction(tx1);

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
    const subject = anchor.web3.Keypair.generate().publicKey;
    const owner1 = new anchor.Wallet(anchor.web3.Keypair.generate());
    const owner2 = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(owner1.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const postbox = new Postbox(conn, owner1, {key: subject, str: "Public"});
    const tx0 = await postbox.initialize([owner1.publicKey, owner2.publicKey]);
    await conn.confirmTransaction(tx0);

    // TODO: check that the owner account is set correctly

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

    const postbox = new Postbox(conn, owner, {key: owner.publicKey});
    const tx0 = await postbox.initialize();
    await conn.confirmTransaction(tx0);

    const testPost = {subj: "Test", body: "This is a test post"};
    const tx1 = await postbox.createPost(testPost);
    await conn.confirmTransaction(tx1);

    const posts = await postbox.fetchPosts();
    const replyPost = {body: "This is a reply post"};
    const tx2 = await postbox.replyToPost(posts[0], replyPost);
    await conn.confirmTransaction(tx2);

    const topLevelPosts = await postbox.fetchPosts();
    assert.equal(topLevelPosts.length, 1);
    const replies = await postbox.fetchReplies(topLevelPosts[0]);
    assert.equal(replies.length, 1);
    assert.ok(replies[0].data.replyTo.equals(topLevelPosts[0].address))
  });

  // TODO(mfasman): add voting support and API, add moderator support, fix up postbox ownership
});

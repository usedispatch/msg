import * as anchor from '@project-serum/anchor';
import { strict as assert } from 'assert';

import { Postbox, DispatchConnection } from '../usedispatch_client/src';

describe('postbox', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const conn = anchor.getProvider().connection;

  it('Initializes a postbox and creates a post', async () => {
    // Set up accounts
    const owner = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(owner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const postbox = new Postbox(new DispatchConnection(conn, owner), {key: owner.publicKey});
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
    const target = anchor.web3.Keypair.generate().publicKey;
    const owner1 = new anchor.Wallet(anchor.web3.Keypair.generate());
    const owner2 = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(owner1.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));

    const postbox = new Postbox(new DispatchConnection(conn, owner1), {key: target, str: "Public"});
    const tx0 = await postbox.initialize([owner1.publicKey, owner2.publicKey]);
    await conn.confirmTransaction(tx0);

    const info = await postbox.getChainPostboxInfo();
    const ownerAddress = await postbox.getSettingsAddress(info, "ownerInfo");
    const ownersAccount = await postbox.dispatch.postboxProgram.account.ownerSettingsAccount.fetch(ownerAddress);
    assert.equal(ownersAccount.owners.length, 2);
    assert.ok(ownersAccount.owners[0].equals(owner1.publicKey));
    assert.ok(ownersAccount.owners[1].equals(owner2.publicKey));

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

    const tx2 = await postboxAsVoter.vote(topLevelPosts[0], true);
    await conn.confirmTransaction(tx2);

    const posts = await postboxAsOwner.fetchPosts();
    assert.equal(posts[0].upVotes, 1);
  });
});

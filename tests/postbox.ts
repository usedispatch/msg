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

    const postbox = new Postbox(conn, owner, owner.publicKey);
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
  });
});

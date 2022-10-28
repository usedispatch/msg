import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import { strict as assert } from 'assert';
import { decode } from 'bs58';
import { config } from 'dotenv';
import {
  DispatchConnection,
  Forum,
  KeyPairWallet
} from '../usedispatch_client/src';
import * as anchor from '@project-serum/anchor';

describe('Token gating', () => {
  let conn: Connection;
  // Owner of the forum
  let ownerKeypair: Keypair;
  // User of the forum
  let userKeypair: Keypair;
  // Unauthorized user
  let unauthorizedUserKeypair: Keypair;
  // A user who has an associated account for the token but does
  // not own it
  let zeroBalanceUserKeypair: Keypair;

  // Wallets
  let owner: KeyPairWallet;
  let user: KeyPairWallet;
  let unauthorizedUser: KeyPairWallet;
  let zeroBalanceUser: KeyPairWallet;

  // Identifier for created forum
  let collectionId: PublicKey;
  // The forum objects for the different parties
  let forumAsOwner: Forum;
  let forumAsUser: Forum;
  let forumAsUnauthorizedUser: Forum;
  let forumAsZeroBalanceUser: Forum;

  before(async () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    conn = anchor.getProvider().connection;
    // Load environment variables from .env, if it exists
    config();

    if (
      !process.env.OWNER_KEY ||
      !process.env.USER_KEY ||
      !process.env.UNAUTHORIZED_USER_KEY ||
      !process.env.USER_WITH_ASSOCIATED_ACCOUNT_WITH_ZERO_BALANCE_KEY
    ) {
      assert.fail(
        'Secret keys not found. If running locally, fetch secret keys from https://www.notion.so/usedispatch/Secret-Keys-for-Testing-c468d260f9514c16aa0e227b6b693421 and write them to a file called .env in the project root'
      );
    }

    // Initialize the two parties
    ownerKeypair = Keypair.fromSecretKey(
      decode(process.env.OWNER_KEY)
    );
    userKeypair = Keypair.fromSecretKey(
      decode(process.env.USER_KEY)
    );
    unauthorizedUserKeypair = Keypair.fromSecretKey(
      decode(process.env.UNAUTHORIZED_USER_KEY)
    );
    zeroBalanceUserKeypair = Keypair.fromSecretKey(
      decode(process.env.USER_WITH_ASSOCIATED_ACCOUNT_WITH_ZERO_BALANCE_KEY!)
    );

    // Initiate wallets for the keypairs
    owner = new KeyPairWallet(ownerKeypair);
    user = new KeyPairWallet(userKeypair);
    unauthorizedUser = new KeyPairWallet(unauthorizedUserKeypair);
    zeroBalanceUser = new KeyPairWallet(zeroBalanceUserKeypair);

    // Define a random collectionId here
    // Normally this would be the PublicKey of the collection
    // mint, but we randomize so it doesn't collide with other
    // forums with the same collectionId for testing purposes
    collectionId = Keypair.generate().publicKey;

    // Initialize forum for both Owner and User
    forumAsOwner = new Forum(new DispatchConnection(conn, owner), collectionId);
    forumAsUser = new Forum(new DispatchConnection(conn, user), collectionId);
    forumAsUnauthorizedUser = new Forum(new DispatchConnection(conn, unauthorizedUser), collectionId);
    forumAsZeroBalanceUser = new Forum(new DispatchConnection(conn, zeroBalanceUser), collectionId);

    const txs = await forumAsOwner.createForum({
      // In the real world, this would be the collection mint ID.
      // But since we need to run this multiple times, it has to
      // be randomized each time
      collectionId,
      owners: [owner.publicKey],
      moderators: [owner.publicKey],
      title: "Test Forum",
      description: "A forum for the test suite",
    });
    await Promise.all(txs.map((t) => conn.confirmTransaction(t)));

    const desc = await forumAsOwner.getDescription()
    assert.notEqual(desc, undefined);
    assert.equal(desc.title, 'Test Forum');
    assert.equal(desc.desc, 'A forum for the test suite');
  });

  it('Validates permissions for the entire forum', async () => {
    await forumAsOwner.setForumPostRestriction(
      {
        nftOwnership: {
          collectionId: new PublicKey('GcMPukzjZWfY4y4KVM3HNdqtZTf5WyTWPvL4YXznoS9c')
        }
      },
      'max'
    );

    const restriction = await forumAsOwner.getForumPostRestriction();
    assert.notEqual(restriction, null);


    const authorizedUserCanCreateTopic = await forumAsUser.canCreateTopic();
    const unauthorizedUserCanCreateTopic = await forumAsUnauthorizedUser.canCreateTopic();
    const zeroBalanceUserCanCreateTopic = await forumAsZeroBalanceUser.canCreateTopic();

    assert.equal(authorizedUserCanCreateTopic, true);
    assert.equal(unauthorizedUserCanCreateTopic, false);
    assert.equal(zeroBalanceUserCanCreateTopic, false);
  });

  it('Attempts to create a topic', async () => {
    const tx0 = await forumAsUser.createTopic({
      subj: 'Subject title',
      body: 'body'
    });
    await conn.confirmTransaction(tx0);

    try {
      const tx = await forumAsUnauthorizedUser.createTopic({
        body: 'body',
        subj: 'subj'
      });
      await conn.confirmTransaction(tx);
      assert.fail();
    } catch (e) {
      const expectedError = 'custom program error: 0x1840';
      assert.ok(e instanceof Error);
      assert.ok(e.message.includes(expectedError));
    }

    try {
      const tx = await forumAsZeroBalanceUser.createTopic({
        body: 'body',
        subj: 'subj'
      });
      await conn.confirmTransaction(tx);
      assert.fail();
    } catch (e) {
      const expectedError = 'custom program error: 0x1840';
      assert.ok(e instanceof Error);
      assert.ok(e.message.includes(expectedError));
    }

  });

  it('Topics without explicit permissions inherit permissions from forum', async () => {
    // forum permissions should be set before this happens
    await forumAsUser.createTopic({
      subj: 'Topic without permissions',
      body: 'body'
    });

    const topics = await forumAsUser.getTopicsForForum();
    const topic = topics.find(topicI => topicI.data.subj === 'Topic without permissions');

    assert.notEqual(topic, null);

    assert.equal(await forumAsUser.canPost(topic), true);
    assert.equal(await forumAsUnauthorizedUser.canPost(topic), false);

    await forumAsUser.replyToForumPost(topic, { subj: 'reply', body: 'unauthorized reply' })
    try {
      await forumAsUnauthorizedUser.replyToForumPost(topic, { subj: 'unauthorized reply', body: 'unauthorized reply' });
      assert.fail();
    } catch (e) {
      const expectedError = 'custom program error: 0x1840';
      assert.ok(e instanceof Error);
      assert.ok(e.message.includes(expectedError));
    }
  });

  it('Validates NFT list (any) permissions', async () => {
    await forumAsOwner.setForumPostRestriction(
      {
        nftListAnyOwnership: {
          collectionIds: [
            PublicKey.default,
            new PublicKey('GcMPukzjZWfY4y4KVM3HNdqtZTf5WyTWPvL4YXznoS9c'),
          ]
        }
      },
      'max'
    );

    const restriction = await forumAsOwner.getForumPostRestriction();
    assert.notEqual(restriction, null);

    await forumAsUser.createTopic({
      subj: 'Topic without permissions',
      body: 'body'
    });
    const topics = await forumAsUser.getTopicsForForum();
    const topic = topics.find(topicI => topicI.data.subj === 'Topic without permissions');
    assert.notEqual(topic, null);

    const authorizedUserCanCreateTopic = await forumAsUser.canCreateTopic();
    const unauthorizedUserCanCreateTopic = await forumAsUnauthorizedUser.canCreateTopic();
    const zeroBalanceUserCanCreateTopic = await forumAsZeroBalanceUser.canCreateTopic();

    assert.equal(authorizedUserCanCreateTopic, true);
    assert.equal(unauthorizedUserCanCreateTopic, false);
    assert.equal(zeroBalanceUserCanCreateTopic, false);
  });
});

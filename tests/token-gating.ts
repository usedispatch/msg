import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  clusterApiUrl
} from '@solana/web3.js';
import { Amman } from '@metaplex-foundation/amman';
import { PROGRAM_ADDRESS } from '@metaplex-foundation/mpl-token-metadata';
import {
  createMint
} from '@solana/spl-token';
import {
  Metaplex,
  keypairIdentity,
  mockStorage
} from '@metaplex-foundation/js';
import { strict as assert } from 'assert';
import { decode } from 'bs58';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import {
  Postbox,
  DispatchConnection,
  Forum,
  clusterAddresses,
  PostRestriction,
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

  // Wallets
  let owner: KeyPairWallet;
  let user: KeyPairWallet;
  let unauthorizedUser: KeyPairWallet;

  // Identifier for created forum
  let collectionId: PublicKey;
  // The forum objects for the different parties
  let forumAsOwner: Forum;
  let forumAsUser: Forum;
  let forumAsUnauthorizedUser: Forum;

  before(async () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    conn = anchor.getProvider().connection;
    // Load environment variables from .env
    // Get info from here for testing
    // https://www.notion.so/usedispatch/Secret-Keys-for-Testing-63a5ffe7fb3f411dbdeeddc54da06ce1
    config();

    // Initialize the two parties
    ownerKeypair = Keypair.fromSecretKey(
      decode(process.env.OWNER_KEY!)
    );
    userKeypair = Keypair.fromSecretKey(
      decode(process.env.USER_KEY!)
    );
    unauthorizedUserKeypair = Keypair.fromSecretKey(
      decode(process.env.UNAUTHORIZED_USER_KEY!)
    );
    
    // Make sure all accounts have some SOL
    const ownerBalance = await conn.getBalance(ownerKeypair.publicKey)
    if (ownerBalance < 2 * LAMPORTS_PER_SOL) {
      await conn.confirmTransaction(await conn.requestAirdrop(ownerKeypair.publicKey, 2 * LAMPORTS_PER_SOL));
    }
    const userBalance = await conn.getBalance(userKeypair.publicKey);
    if (userBalance < 2 * LAMPORTS_PER_SOL) {
      await conn.confirmTransaction(await conn.requestAirdrop(userKeypair.publicKey, 2 * LAMPORTS_PER_SOL));
    }
    const unauthorizedUserBalance = await conn.getBalance(unauthorizedUserKeypair.publicKey);
    if (unauthorizedUserBalance < 2 * LAMPORTS_PER_SOL) {
      await conn.confirmTransaction(await conn.requestAirdrop(unauthorizedUserKeypair.publicKey, 2 * LAMPORTS_PER_SOL));
    }

    // Initiate wallets for the keypairs
    owner = new KeyPairWallet(ownerKeypair);
    user = new KeyPairWallet(userKeypair);
    unauthorizedUser = new KeyPairWallet(unauthorizedUserKeypair);

    // Define a random collectionId here
    // Normally this would be the PublicKey of the collection
    // mint, but we randomize so it doesn't collide with other
    // forums with the same collectionId for testing purposes
    collectionId = Keypair.generate().publicKey;

    // Initialize forum for both Owner and User
    forumAsOwner = new Forum(new DispatchConnection(conn, owner), collectionId);
    forumAsUser = new Forum(new DispatchConnection(conn, user), collectionId);
    forumAsUnauthorizedUser = new Forum(new DispatchConnection(conn, unauthorizedUser), collectionId);

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

    assert.equal(authorizedUserCanCreateTopic, true);
    assert.equal(unauthorizedUserCanCreateTopic, false);
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
    } catch (e) {
      const expectedError = 'Error processing Instruction 0: custom program error: 0x1840';
      assert.ok(e instanceof Error);
      assert.ok(e.message.includes(expectedError));
    }

    forumAsUnauthorizedUser.canVote

  });

  after(() => {
    // Atomics.wait(
    //   new Int32Array(new SharedArrayBuffer(4)),
    //   0, 0,
    //   6 * 1000
    // );
  });
});

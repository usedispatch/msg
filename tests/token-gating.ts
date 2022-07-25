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
    // conn = new Connection('https://devnet.genesysgo.net/');
    config();

    // Initialize the two parties
    ownerKeypair = Keypair.fromSecretKey(
      decode(process.env.OWNER_KEY!)
    );
    console.log('Owner pubkey', ownerKeypair.publicKey.toBase58());
    userKeypair = Keypair.fromSecretKey(
      decode(process.env.USER_KEY!)
    );
    console.log('User pubkey', userKeypair.publicKey.toBase58());
    unauthorizedUserKeypair = Keypair.fromSecretKey(
      decode(process.env.UNAUTHORIZED_USER_KEY!)
    );
    console.log('Unauthorized user pubkey', unauthorizedUserKeypair.publicKey.toBase58());
    
    // Make sure all accounts have some SOL
    const ownerBalance = await conn.getBalance(ownerKeypair.publicKey)
    if (ownerBalance < 2 * LAMPORTS_PER_SOL) {
      await conn.confirmTransaction(await conn.requestAirdrop(ownerKeypair.publicKey, 2 * LAMPORTS_PER_SOL));
    }
    console.log('owner balance', ownerBalance);
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
    // const collectionId = new PublicKey('GcMPukzjZWfY4y4KVM3HNdqtZTf5WyTWPvL4YXznoS9c');
    collectionId = new Keypair().publicKey;

    // Initialize forum for both Owner and User
    console.log('Creating owner forum object');
    forumAsOwner = new Forum(new DispatchConnection(conn, owner), collectionId);
    console.log('Creating user forum object');
    forumAsUser = new Forum(new DispatchConnection(conn, user), collectionId);
    console.log('Creating unauthorized user forum object');
    forumAsUnauthorizedUser = new Forum(new DispatchConnection(conn, unauthorizedUser), collectionId);

    console.log('Creating forum on-chain');
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

    console.log('Getting description');
    const desc = await forumAsOwner.getDescription()
    assert.notEqual(desc, undefined);
    assert.equal(desc.title, 'Test Forum');
    assert.equal(desc.desc, 'A forum for the test suite');
  });

  it('Validates permissions for the entire forum', async () => {
    console.log('Setting permissions');
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

    console.log('Verifying that an authorized user can create a topic');
    assert.equal(authorizedUserCanCreateTopic, true);
    console.log('Verifying that an unauthorized user cannot create a topic');
    assert.equal(unauthorizedUserCanCreateTopic, false);
  });

  it('Attempts to create a topic', async () => {
    assert.doesNotThrow(async () => {
      const tx = await forumAsUser.createTopic({
        subj: 'Subject title',
        body: 'body'
      });
      await conn.confirmTransaction(tx);
    });

    assert.throws(async () => {
      const tx = await forumAsUnauthorizedUser.createTopic({
        body: 'body',
        subj: 'subj'
      });
      await conn.confirmTransaction(tx);
    });

    console.log(await forumAsUser.getTopicsForForum());
  });

  after(() => {
    // Atomics.wait(
    //   new Int32Array(new SharedArrayBuffer(4)),
    //   0, 0,
    //   6 * 1000
    // );
  });
});

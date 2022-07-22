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
} from '../src';

describe('Token gating', () => {
  let conn: Connection;
  // Owner of the forum
  let ownerKeypair: Keypair;
  // User of the forum
  let userKeypair: Keypair;
  // Unauthorized user
  let unauthorizedUserKeypair: Keypair;

  beforeAll(async () => {
    conn = new Connection(clusterApiUrl('devnet'));
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
    
    // Airdrop both some SOL
    // await conn.confirmTransaction(await conn.requestAirdrop(ownerKeypair.publicKey, 2 * LAMPORTS_PER_SOL));
    // await conn.confirmTransaction(await conn.requestAirdrop(userKeypair.publicKey, 2 * LAMPORTS_PER_SOL));
    // await conn.confirmTransaction(await conn.requestAirdrop(unauthorizedUserKeypair.publicKey, 2 * LAMPORTS_PER_SOL));
  });

  test('Validates permissions on a postbox with token gating', async () => {
    // Initialize collection ID
    // const collectionId = new PublicKey('GcMPukzjZWfY4y4KVM3HNdqtZTf5WyTWPvL4YXznoS9c');
    const collectionId = new Keypair().publicKey;


    // Initiate wallets from the parties
    const owner = new KeyPairWallet(ownerKeypair);
    const user = new KeyPairWallet(userKeypair);
    const unauthorizedUser = new KeyPairWallet(unauthorizedUserKeypair);

    // Do some airdropping

    // Initialize forum for both Owner and User
    console.log('Creating owner forum object');
    const forumAsOwner = new Forum(new DispatchConnection(conn, owner), collectionId);
    console.log('Creating user forum object');
    const forumAsUser = new Forum(new DispatchConnection(conn, user), collectionId);
    console.log('Creating unauthorized user forum object');
    const forumAsUnauthorizedUser = new Forum(new DispatchConnection(conn, unauthorizedUser), collectionId);

    const balance = await conn.getBalance(ownerKeypair.publicKey);
    console.log('owner balance', balance);

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
    console.log('desc', desc);

    console.log('Setting permissions');
    await forumAsOwner.setForumPostRestriction(
      {
        nftOwnership: {
          collectionId: new PublicKey('GcMPukzjZWfY4y4KVM3HNdqtZTf5WyTWPvL4YXznoS9c')
        }
      }
    );

    console.log('Verifying permissions were set');
    const restriction = await forumAsOwner.getForumPostRestriction();
    expect(restriction).not.toBeNull();
    console.log('restriction', restriction);


    const authorizedUserCanCreateTopic = await forumAsUser.canCreateTopic();
    const unauthorizedUserCanCreateTopic = await forumAsUnauthorizedUser.canCreateTopic();

    expect(authorizedUserCanCreateTopic).toBe(true);
    expect(unauthorizedUserCanCreateTopic).toBe(false);
  });

  afterAll(() => {
    Atomics.wait(
      new Int32Array(new SharedArrayBuffer(4)),
      0, 0,
      6 * 1000
    );
  });
});

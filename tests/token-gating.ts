import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { Amman } from '@metaplex-foundation/amman';
import { PROGRAM_ADDRESS } from '@metaplex-foundation/mpl-token-metadata';
import * as splToken from '@solana/spl-token';
import {
  Metaplex,
  keypairIdentity,
  mockStorage
} from '@metaplex-foundation/js';
import { strict as assert } from 'assert';
import {
  Postbox,
  DispatchConnection,
  Forum,
  clusterAddresses,
  PostRestriction,
  KeyPairWallet
} from '../usedispatch_client/src';

describe('Token gating', () => {
  let conn: Connection;

  before(() => {
    conn = new Connection( 'http://localhost:8899');
  });

  it('Validates permissions on a postbox with token gating', async () => {
    // Initialize collection ID
    const collectionId = Keypair.generate().publicKey;

    // And the two parties
    const ownerKeypair = Keypair.generate();
    const userKeypair = Keypair.generate();

    // Initiate wallets from the parties
    const owner = new KeyPairWallet(ownerKeypair);
    const user = new KeyPairWallet(userKeypair);

    // Airdrop both parties some SOL
    await conn.confirmTransaction(
      await conn.requestAirdrop(ownerKeypair.publicKey, 2 * LAMPORTS_PER_SOL)
    );
    await conn.confirmTransaction(
      await conn.requestAirdrop(userKeypair.publicKey, 2 * LAMPORTS_PER_SOL)
    );

    // Initialize forum for both Owner and User
    const forumAsOwner = new Forum(new DispatchConnection(conn, owner), collectionId);
    const forumAsUser = new Forum(new DispatchConnection(conn, user), collectionId);

    const txs = await forumAsOwner.createForum({
      collectionId,
      owners: [owner.publicKey],
      moderators: [owner.publicKey],
      title: "Test Forum",
      description: "A forum for the test suite",
    });
    await Promise.all(txs.map((t) => conn.confirmTransaction(t)));
  });
});

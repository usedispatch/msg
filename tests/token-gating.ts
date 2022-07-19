import * as anchor from '@project-serum/anchor';
import * as splToken from '@solana/spl-token';
import {
  Metaplex,
  keypairIdentity,
  mockStorage
} from '@metaplex-foundation/js';
import { strict as assert } from 'assert';
import { Postbox, DispatchConnection, Forum, clusterAddresses, PostRestriction } from '../usedispatch_client/src';

describe('Token gating', () => {

  before(() => {
    console.log('setup');
  });

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const conn = anchor.getProvider().connection;
  const TREASURY = clusterAddresses.get("devnet").treasuryAddress;

  it('Validates permissions on a postbox with token gating', async () => {
    // Generate a new collection id for our forum
    // TODO this collection id should contain at least one token
    const collectionId = anchor.web3.Keypair.generate().publicKey;

    const ownerKeypair = anchor.web3.Keypair.generate();

    // Create an owner and a poster
    const owner = new anchor.Wallet(ownerKeypair);
    const poster = new anchor.Wallet(anchor.web3.Keypair.generate());
    await conn.confirmTransaction(await conn.requestAirdrop(owner.publicKey, 20 * anchor.web3.LAMPORTS_PER_SOL));
    await conn.confirmTransaction(await conn.requestAirdrop(poster.publicKey, 20 * anchor.web3.LAMPORTS_PER_SOL));

    const forumAsOwner = new Forum(new DispatchConnection(conn, owner), collectionId);
    const forumAsPoster = new Forum(new DispatchConnection(conn, poster), collectionId);

    const txs = await forumAsOwner.createForum({
      collectionId,
      owners: [owner.publicKey],
      moderators: [owner.publicKey],
      title: "Test Forum",
      description: "A forum for the test suite",
    });
    await Promise.all(txs.map((t) => conn.confirmTransaction(t)));

    const metaplex = Metaplex.make(conn)
      .use(keypairIdentity(ownerKeypair))
      .use(mockStorage())

    const data = await metaplex.nfts().uploadMetadata({
      name: 'Test NFT'
    })

    const { nft } = await metaplex.nfts().create({
      name: 'a test nft',
      uri: data.uri,
      sellerFeeBasisPoints: 500
    });

    // console.log(data, nft);

    // https://github.com/metaplex-foundation/js/pull/145
    // verify collection feature
  });

  after(() => {
    console.log('teardown');
  });
});

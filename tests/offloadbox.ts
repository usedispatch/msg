import * as anchor from '@project-serum/anchor';
import { strict as assert } from 'assert';
import { DispatchConnection, clusterAddresses, offloadbox, seeds } from '../usedispatch_client/src';

describe('offloadbox', () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const conn = anchor.getProvider().connection;
  const TREASURY = clusterAddresses.get('devnet').treasuryAddress;

  it('Initializes an offloadbox', async () => {
    // Generate a new wallet
    const owner = new anchor.Wallet(anchor.web3.Keypair.generate());
    // Give the user SOL
    await conn.confirmTransaction(await conn.requestAirdrop(owner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    // Give the treasury SOL
    await conn.confirmTransaction(await conn.requestAirdrop(TREASURY, 1 * anchor.web3.LAMPORTS_PER_SOL));

    const identifier = 'spaghetti';

    // Create the offloadbox
    await offloadbox.createOffloadbox(
      conn, owner, identifier
    );

    // Load the created account using the given seeds
    let info = await offloadbox.fetchOffloadbox(
      conn, owner, identifier
    );

    assert.deepEqual(info.addresses, []);

    await offloadbox.makePost(
      conn, owner, identifier,
      'MxgIfUxomILxEXIEGXcPjXb8y4Jh-XOGXQ7JMv4QFmE'
    );

    info = await offloadbox.fetchOffloadbox(
      conn, owner, identifier
    );

    assert.deepEqual(info.addresses, [
      'MxgIfUxomILxEXIEGXcPjXb8y4Jh-XOGXQ7JMv4QFmE'
    ]);
  });

  it('Nonexistent wallet cannot be fetched', async () => {
    // Generate a new wallet
    const owner = new anchor.Wallet(anchor.web3.Keypair.generate());
    // Give the user SOL
    await conn.confirmTransaction(await conn.requestAirdrop(owner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL));
    // Give the treasury SOL
    await conn.confirmTransaction(await conn.requestAirdrop(TREASURY, 1 * anchor.web3.LAMPORTS_PER_SOL));
    const result = await offloadbox.fetchOffloadbox(conn, owner, 'hello');
    assert.equal(result, undefined);
  });
});

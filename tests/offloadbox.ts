import * as anchor from '@project-serum/anchor';
import { strict as assert } from 'assert';
import { DispatchConnection, clusterAddresses, offloadbox } from '../usedispatch_client/src';

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
    // Initialize the offloadbox
  });
});

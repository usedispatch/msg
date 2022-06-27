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
    // Initialize the Connection
    const dispatch = new DispatchConnection(conn, owner);

    const identifier = 'spaghetti';

    // Create the offloadbox
    await offloadbox.createOffloadbox(
      dispatch, identifier, dispatch.wallet.publicKey
    );

    // Load the created account using the given seeds
    const info = await offloadbox.fetchOffloadbox(
      dispatch, identifier
    );

    console.log('info', info);

    // const ax = await dispatch.offloadboxProgram.methods
    //   .makePost([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    //   .accounts({
    //     offloadbox: offloadboxAddress
    //   })
    //   .transaction()
    // const receipt2 = await dispatch.sendTransaction(ax);
    // await conn.confirmTransaction(receipt2);
    // const info2 = await dispatch.offloadboxProgram.account.offloadbox.fetch(
    //   offloadboxAddress
    // );
    // console.log('info2', info2);
  });
});

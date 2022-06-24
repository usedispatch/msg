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
    // Issue initialization instruction with some test data
    const ix = await dispatch.offloadboxProgram.methods
      .initialize(38383123)
      .accounts({
        signer: dispatch.wallet.publicKey!,
        treasury: dispatch.addresses.treasuryAddress
      })
      .transaction();

    const receipt = await dispatch.sendTransaction(ix);
    await conn.confirmTransaction(receipt);

    // Load the created account using the given seeds
    const [offloadboxAddress] = await anchor.web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.offloadboxSeed],
      dispatch.offloadboxProgram.programId
    )

    const info = await dispatch.offloadboxProgram.account.offloadbox.fetch(
      offloadboxAddress
    );

    console.log('info', info);
  });
});

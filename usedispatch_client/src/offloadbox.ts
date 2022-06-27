import * as web3 from '@solana/web3.js';
import { DispatchConnection } from './connection';
import { seeds } from './constants';

export interface Offloadbox {
  address: web3.PublicKey;
};

/**
 * This function initializes a new offloadbox using the publicKey
 * associated with the current connection
 * The offloadbox
 */
export async function createOffloadbox(
  dispatch: DispatchConnection,
  identifier: string,
  user: web3.PublicKey = dispatch.wallet.publicKey!
): Promise<string> {
  const tx = await dispatch.offloadboxProgram.methods
  .initialize(
    identifier
  )
  .accounts({
    signer: user ?? dispatch.wallet.publicKey!,
    treasury: dispatch.addresses.treasuryAddress
  })
  .transaction()

  // Send and confirm the transaction
  const result = await dispatch.sendTransaction(tx);
  await dispatch.conn.confirmTransaction(result);
  return result;
}

export async function makePost(
  dispatch: DispatchConnection,
  identifier: string, // identifies the offloadbox
  content: string // post content
) {
}

export async function fetchOffloadbox(
  dispatch: DispatchConnection,
  identifier: string
) {
  const [address] = await web3.PublicKey.findProgramAddress(
    [seeds.protocolSeed, seeds.offloadboxSeed, Buffer.from(identifier)],
    dispatch.offloadboxProgram.programId
  );

  return dispatch.offloadboxProgram.account.offloadbox.fetch(
    address
  );
}

import * as web3 from '@solana/web3.js';
import { DispatchConnection } from './connection';
import { seeds } from './constants';
import base64url from 'base64url';

type ArweaveAddress = string;

export interface Offloadbox {
  /** Arweave addresses */
  addresses: ArweaveAddress[]
};

/**
 * This function initializes a new offloadbox using the publicKey
 * associated with the current connection
 * The offloadbox
 */
export async function createOffloadbox(
  dispatch: DispatchConnection,
  identifier: string,
  user: web3.PublicKey
): Promise<string> {
  const tx = await dispatch.offloadboxProgram.methods
  .initialize(
    identifier
  )
  .accounts({
    signer: user,
    treasury: dispatch.addresses.treasuryAddress
  })
  .transaction()

  // Send and confirm the transaction
  const id = await dispatch.sendTransaction(tx);
  await dispatch.conn.confirmTransaction(id);
  return id;
}

export async function makePost(
  dispatch: DispatchConnection,
  // TODO make this size-bounded so no one creates an identifier
  // that is way too big
  identifier: string, // identifies the offloadbox
  arweaveAddr: string,
) {
  // Look up account
  const [address] = await web3.PublicKey.findProgramAddress(
    [seeds.protocolSeed, seeds.offloadboxSeed, Buffer.from(identifier)],
    dispatch.offloadboxProgram.programId
  );

  // Get arweave bytes
  const bytes = base64url.toBuffer(arweaveAddr)

  // Create and send transaction
  const tx = await dispatch.offloadboxProgram.methods
    .makePost(Array.from(bytes))
    .accounts({
      offloadbox: address
    })
    .transaction();

  const id = await dispatch.sendTransaction(tx);
  await dispatch.conn.confirmTransaction(id);
  return id;
}

export async function fetchOffloadbox(
  dispatch: DispatchConnection,
  identifier: string
) {
  const [address] = await web3.PublicKey.findProgramAddress(
    [seeds.protocolSeed, seeds.offloadboxSeed, Buffer.from(identifier)],
    dispatch.offloadboxProgram.programId
  );

  const offloadbox = await dispatch.offloadboxProgram.account.offloadbox.fetch(
    address
  );

  const addresses = offloadbox.addresses as number[][];
  const addrStrings = addresses.map(addr =>
    base64url.encode(Buffer.from(addr))
  );
  console.log(addrStrings);


  return {
    addresses: addrStrings
  };
}

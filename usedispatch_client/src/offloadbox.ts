import * as web3 from '@solana/web3.js';
import { seeds, clusterAddresses } from './constants';
import base64url from 'base64url';
import * as anchor from '@project-serum/anchor';
import { Offloadbox } from '../../target/types/offloadbox';
import offloadboxProgramIdl from '../../target/idl/offloadbox.json';
import { DispatchConnection } from './connection';
import { WalletInterface } from './wallets';

type ArweaveAddress = string;

/**
 * This function initializes a new offloadbox using the publicKey
 * associated with the current connection
 * The offloadbox
 */
export async function createOffloadbox(
  conn: web3.Connection,
  user: WalletInterface,
  identifier: string,
  cluster?: web3.Cluster
): Promise<string> {
  const dispatch = new DispatchConnection(conn, user, { cluster });
  const tx = await dispatch.offloadboxProgram.methods
  .initialize(
    identifier
  )
  .accounts({
    signer: user.publicKey!,
    treasury: dispatch.addresses.treasuryAddress
  })
  .transaction()

  // Send and confirm the transaction
  const id = await dispatch.sendTransaction(tx);
  await dispatch.conn.confirmTransaction(id);
  return id;
}

export async function makePost(
  conn: web3.Connection,
  user: WalletInterface,
  // TODO make this size-bounded so no one creates an identifier
  // that is way too big
  identifier: string, // identifies the offloadbox
  arweaveAddr: string,
  cluster?: web3.Cluster
) {
  const dispatch = new DispatchConnection(conn, user, { cluster });
  // Look up account
  const [address] = await web3.PublicKey.findProgramAddress(
    [/*seeds.protocolSeed, */ seeds.offloadboxSeed, Buffer.from(identifier)],
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
  conn: web3.Connection,
  user: WalletInterface,
  identifier: string,
  cluster?: web3.Cluster
) {
  const dispatch = new DispatchConnection(conn, user, { cluster });
  const [address] = await web3.PublicKey.findProgramAddress(
    [/*seeds.protocolSeed,*/ seeds.offloadboxSeed, Buffer.from(identifier)],
    dispatch.offloadboxProgram.programId
  );

  try {
    const offloadbox = await dispatch.offloadboxProgram.account.offloadbox.fetch(
      address
    );

    const addresses = offloadbox.addresses as number[][];
    const addrStrings = addresses.map(addr =>
      base64url.encode(Buffer.from(addr))
    );


    return {
      addresses: addrStrings
    };

  } catch(e) {
    return undefined;
  }
}

import {
  Connection,
  PublicKey,
  clusterApiUrl
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import {
  Metadata,
  PROGRAM_ID
} from '@metaplex-foundation/mpl-token-metadata';

export async function deriveMetadataAccount(
  mint: PublicKey
) {
  const [key] = await PublicKey.findProgramAddress([
    Buffer.from('metadata'),
    PROGRAM_ID.toBuffer(),
    mint.toBuffer()
  ], PROGRAM_ID);

  return key;
}

export async function getMintsForOwner(
  connection: Connection,
  publicKey: PublicKey
): Promise<PublicKey[]> {

  const { value } = await connection.getParsedTokenAccountsByOwner(
    publicKey, { programId: TOKEN_PROGRAM_ID }
  );

  const parsedObjects = value.map(({ account }) => account.data.parsed);
  const mints = parsedObjects
  .filter(obj =>
    'info' in obj &&
    'mint' in obj.info && 
    typeof obj.info.mint === 'string'
  )
  .map(obj => new PublicKey(obj.info.mint))

  return mints;
}

/**
 * This function returns all the `Metadata` objects associated
 * with a particular PublicKey. Note that this includes both
 * fungible and non-fungible tokens
 */
export async function getMetadataForOwner(
  connection: Connection,
  publicKey: PublicKey
): Promise<Metadata[]> {
  const mints = await getMintsForOwner(connection, publicKey);

  const derivedAddresses = await Promise.all(
    mints.map(mint =>
      deriveMetadataAccount(mint)
    )
  );

  return Promise.all(
    derivedAddresses.map(addr =>
      Metadata.fromAccountAddress(
        connection,
        addr
      )
    )
  );
}

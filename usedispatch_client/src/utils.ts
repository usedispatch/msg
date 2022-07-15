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
  // This key derivation is based on the fields describe here:
  // https://github.com/metaplex-foundation/metaplex-program-library/blob/0d63c8b3c6ac077dba63519c78a8da7a58b285a1/token-metadata/js/src/generated/instructions/MintNewEditionFromMasterEditionViaToken.ts#L46
  // TODO confirm with Metaplex team that this is the correct
  // derivation
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

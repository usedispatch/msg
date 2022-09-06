import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { chunk, concat } from 'lodash';
import { Metadata, PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import { Result } from '../src/types';

export async function deriveMetadataAccount(mint: PublicKey) {
  // This key derivation is based on the fields describe here:
  // https://github.com/metaplex-foundation/metaplex-program-library/blob/0d63c8b3c6ac077dba63519c78a8da7a58b285a1/token-metadata/js/src/generated/instructions/MintNewEditionFromMasterEditionViaToken.ts#L46
  // TODO confirm with Metaplex team that this is the correct
  // derivation
  const [key] = await PublicKey.findProgramAddress(
    [Buffer.from('metadata'), PROGRAM_ID.toBuffer(), mint.toBuffer()],
    PROGRAM_ID,
  );

  return key;
}

/**
 * This function will return a list of a mints for which the user
 * has a balance of one or more. Note that this will include both
 * fungible and non-fungible tokens, as long as their balance is
 * greater than zero
 */
export async function getMintsForOwner(connection: Connection, publicKey: PublicKey): Promise<PublicKey[]> {
  const { value } = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });

  const parsedObjects = value.map(({ account }) => account.data.parsed);
  const mints = parsedObjects
    .filter(
      (obj) =>
        'info' in obj &&
        // Confirm the object has a mint, which is a string
        'mint' in obj.info &&
        typeof obj.info.mint === 'string' &&
        // Confirm the object has a token amount, which is greater than zero
        'tokenAmount' in obj.info &&
        'amount' in obj.info.tokenAmount &&
        typeof obj.info.tokenAmount.amount === 'string' &&
        Number(obj.info.tokenAmount.amount) > 0,
    )
    .map((obj) => new PublicKey(obj.info.mint));

  return mints;
}

export async function getMetadataForMints(connection: Connection, mints: PublicKey[]): Promise<Metadata[]> {
  // Derive addresses for all metadata accounts
  const derivedAddresses = await Promise.all(mints.map(async (mint) => deriveMetadataAccount(mint)));
  // Fetch all accounts, paginated
  const accountInfoOrNullList = await getAccountsInfoPaginated(connection, derivedAddresses);
  // Filter out nulls
  const accountInfoList = accountInfoOrNullList.filter((acct) => acct !== null) as AccountInfo<Buffer>[];
  return (
    accountInfoList
      // TODO check if Metadata.fromAccountInfo throws errors and
      // implement try/catch block here if they do
      .map((accountInfo) => Metadata.fromAccountInfo(accountInfo))
      .map(([metadata]) => metadata)
  );
}

/**
 * Like connection.getMultipleAccountsInfo, but paginated over
 * groups of (default) 100 to prevent endpoint errors
 */
export async function getAccountsInfoPaginated(
  connection: Connection,
  pkeys: PublicKey[],
  chunkSize = 100
): Promise<(AccountInfo<Buffer> | null)[]> {
  // Divide the list of publicKeys into groups of size `chunkSize`
  const chunks = chunk(pkeys, chunkSize)
  // Fetch each group of publicKeys in its own
  // getMultipleAccountsInfo() call
  const chunkFetchPromises = chunks.map(c => {
    return connection.getMultipleAccountsInfo(c)
  });

  // Await all these promises to get a list of lists of
  // AccountInfo's
  const fetchedChunks = await Promise.all(chunkFetchPromises);

  // Flatten this group to get all accountInfo in one array
  const result = fetchedChunks.flat();

  return result;
}

/**
 * This function fails with an Error if there is no Metadata
 * associated with the mint
 */
export async function getMetadataForMint(connection: Connection, mint: PublicKey): Promise<Result<Metadata>> {
  const metadataList = await getMetadataForMints(connection, [mint]);

  const result = metadataList[0];
  if (result) {
    return result;
  } else {
    return {
      error: true,
      message: `Derived account for mint ${mint.toBase58()} not found`,
    };
  }
}

/**
 * This function returns all the `Metadata` objects associated
 * with a particular PublicKey. Note that this includes both
 * fungible and non-fungible tokens
 */
export async function getMetadataForOwner(connection: Connection, publicKey: PublicKey): Promise<Metadata[]> {
  const mints = await getMintsForOwner(connection, publicKey);

  const metadataList = await getMetadataForMints(connection, mints);

  const successes = metadataList.filter((metadata) => !('error' in metadata));

  return successes as Metadata[];
}

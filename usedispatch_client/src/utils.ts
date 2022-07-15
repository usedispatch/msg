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

// export interface NFT {
//   mint: string;
//   collection?: string;
// }

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

export async function getNFTsForOwner(
  connection: Connection,
  publicKey: PublicKey
): Promise<Metadata[]> {
  const mints = await getMintsForOwner(connection, publicKey);

  const derivedAddresses = await Promise.all(
    mints.map(mint =>
      PublicKey.findProgramAddress([
        Buffer.from('metadata'),
        PROGRAM_ID.toBuffer(),
        mint.toBuffer()
      ],
        PROGRAM_ID
      ).then(([derived]) => derived)
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

async function main() {
  const conn = new Connection(clusterApiUrl('mainnet-beta'));

  const nfts = await getNFTsForOwner(
    conn,
    new PublicKey(
      '7ycUFfnspMwnjp2DfSjAvZgf7g7T6nugrGv2kpzogrNC'
    )
  );

  console.log(nfts);
}

main();

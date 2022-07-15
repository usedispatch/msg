import {
  Connection,
  PublicKey,
  clusterApiUrl
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';

// export interface NFT {
//   mint: string;
//   collection?: string;
// }

export async function getMintsForOwner(
  connection: Connection,
  publicKey: PublicKey
): Promise<any> {

  const { value } = await connection.getParsedTokenAccountsByOwner(
    publicKey, { programId: TOKEN_PROGRAM_ID }
  );

  const parsedObjects = value.map(({ account }) => account.data.parsed);
  const mints = parsedObjects
  .filter(obj => 'info' in obj && 'mint' && obj.info)
  .map(obj => obj.info.mint)

  return mints;
}

async function main() {
  const conn = new Connection(clusterApiUrl('mainnet-beta'));

  const nfts = await getMintsForOwner(
    conn,
    new PublicKey(
      '7ycUFfnspMwnjp2DfSjAvZgf7g7T6nugrGv2kpzogrNC'
    )
  );

  console.log(nfts);
}

main();

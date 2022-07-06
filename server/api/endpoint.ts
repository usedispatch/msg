/*
 *
 */
import { offloadbox } from '../../usedispatch_client';
import {
  NextApiRequest,
  NextApiResponse
} from 'next';
import {
  Connection,
  clusterApiUrl
} from '@solana/web3.js';

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  // TODO check all these fields
  const parsed = JSON.parse(request.body);
  // Text should be no more than 256 chars long
  const text = parsed.text as string;
  // txid should be from a transaction that ran recently
  const txid = parsed.txid as string;

  // Initialize connection
  const connection = new Connection(clusterApiUrl('devnet'));
  const tx = await connection.getTransaction(txid);

  const result = {
    tx
  };
  response.end(JSON.stringify(result));
}

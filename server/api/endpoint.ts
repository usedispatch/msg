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
  try {
    // TODO check all these fields
    const parsed: ConfirmTransaction = JSON.parse(request.body);

    // TODO confirm that result is properly structured
    const result = await confirmTransaction(parsed);

    response.end(JSON.stringify(result));
  } catch(e) {
    response.end(e.toString());
  }
}

interface ConfirmTransaction {
  txid: string;
  text: string;
}
async function confirmTransaction({ txid, text }: ConfirmTransaction) {
  // Initialize connection
  const connection = new Connection(clusterApiUrl('devnet'));
  const tx = await connection.getTransaction(txid);

  const result = {
    tx
  };
  return result;
}

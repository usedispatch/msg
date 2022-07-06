import { offloadbox } from '../../usedispatch_client';
import {
  NextApiRequest,
  NextApiResponse
} from 'next';
import {
  Connection,
  clusterApiUrl
} from '@solana/web3.js';
import {
  ActionKind,
  EndpointParameters
} from '../src/types';

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  // Initialize connection
  const conn = new Connection(clusterApiUrl('devnet'));

  try {
    // TODO check all these fields
    const parsed: EndpointParameters = JSON.parse(request.body);

    if (parsed.kind === ActionKind.CreateForum) {
      response.end('received CreateForum');
      // TODO create forum here
    }

  } catch(e) {
    response.end(e.toString());
  }
}

/*
 * Confirm that a user paid at least X lamports
 */
async function confirmTransaction(
  connection: Connection,
  txid: string,
  text: string
) {
  const tx = await connection.getTransaction(txid);

  const result = {
    tx
  };
  return result;
}

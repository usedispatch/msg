import { offloadbox } from '../../usedispatch_client';
import {
  NextApiRequest,
  NextApiResponse
} from 'next';
import {
  Connection,
  clusterApiUrl,
  Keypair,
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

    let result: any

    if (parsed.kind === ActionKind.CreateForum) {
      result = 'Create forum';
      // TODO create forum here
    } else if (parsed.kind === ActionKind.GetServerPubkey) {
      const seed = JSON.parse(process.env['ENDPOINT_SECRET_KEY']!);
      const bytes = new Uint8Array(seed);
      const keypair = Keypair.fromSecretKey(bytes);
      result = keypair.publicKey.toBase58();
    }

    response.end(JSON.stringify({result}));
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

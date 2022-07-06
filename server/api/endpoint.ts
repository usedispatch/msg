import { offloadbox } from '../../usedispatch_client';
import {
  NextApiRequest,
  NextApiResponse
} from 'next';
import {
  Connection,
  clusterApiUrl,
  Keypair,
  PublicKey
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
      const { userPubkeyBase58 } = parsed;
      const userPubkey = new PublicKey(userPubkeyBase58);

      result = await confirmPayment(
        conn,
        '2jaX9RvCdY4Xishuy5LTJr7gT3VfVKEztxCzK4af1qFnQoZ9X6tNR5L2b5YPBeUHCu71u5BaV4MAwne7hDeKb4za',
        'hello'
      );
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
 * Confirm that a user paid at least n lamports
 */
async function confirmPayment(
  connection: Connection,
  txid: string,
  text: string,
  n: Number = 50000
) {
  const tx = await connection.getParsedTransaction(txid);
  const instructions=  tx.transaction.message.instructions;
  return instructions;
}

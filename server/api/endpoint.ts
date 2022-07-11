import {
  offloadbox,
  KeyPairWallet,
  CREATE_OFFLOADBOX_FEE
} from '@usedispatch/client';
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

export function getEndpointKeypair(): Keypair {
  // TODO handle exceptions here
  const seed = JSON.parse(process.env['ENDPOINT_SECRET_KEY']!);
  const bytes = new Uint8Array(seed);
  const keypair = Keypair.fromSecretKey(bytes);
  return keypair;
}

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  // Initialize connection
  const connection = new Connection(clusterApiUrl('devnet'));

  try {
    // TODO check all these fields
    const parsed: EndpointParameters = JSON.parse(request.body);

    let result: any

    response.end(JSON.stringify({result}));
  } catch(e) {
    console.error(e);
    response.end(JSON.stringify({
      error: e.toString()
    }));
  }
}

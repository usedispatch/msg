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
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  ActionKind,
  EndpointParameters
} from '../src/types';

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  // Initialize connection
  const connection = new Connection(clusterApiUrl('mainnet-beta'));

  try {
    // TODO validate all these fields
    // TODO make sure there's no injection here?
    const parsed: EndpointParameters = JSON.parse(request.body);

    let result: any

    switch(parsed.kind) {
      default:
        result = `Error: unhandled action type: ${parsed.kind}`
    }

    response.end(JSON.stringify({result}));
  } catch(e) {
    console.error(e);
    response.end(JSON.stringify({
      error: e.toString()
    }));
  }
}

export function getEndpointKeypair(): Keypair {
  // TODO handle exceptions here
  const seed = JSON.parse(process.env['ENDPOINT_SECRET_KEY']!);
  const bytes = new Uint8Array(seed);
  const keypair = Keypair.fromSecretKey(bytes);
  return keypair;
}

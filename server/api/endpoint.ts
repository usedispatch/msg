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

export async function action(
  params: EndpointParameters
) {
  if (params.kind === ActionKind.GetServerPubkey) {
    return getEndpointKeypair().publicKey.toBase58();
  } else if (params.kind === ActionKind.ValidateTransaction) {
    // Return true here if the authentication token is good,
    // false otherwise
    return false;
  }
};

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  try {
    // TODO validate all these fields
    // TODO make sure there's no injection here?
    const params: EndpointParameters = JSON.parse(request.body);

    const result = action(params);

    response.end(JSON.stringify({result}));
  } catch(e) {
    console.error(e);
    response.end(JSON.stringify({
      error: e.toString()
    }));
  }
}

/**
 * TODO use this for signing
 */
export function getEndpointKeypair(): Keypair {
  // TODO handle exceptions here
  const seed = JSON.parse(process.env['ENDPOINT_SECRET_KEY']!);
  const bytes = new Uint8Array(seed);
  const keypair = Keypair.fromSecretKey(bytes);
  return keypair;
}

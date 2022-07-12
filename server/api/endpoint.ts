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
import Picket from '@picketapi/picket-js';
import { config } from 'dotenv';
config()

// TODO move logic into here
export async function validateTransaction() {
}

export async function action(
  params: EndpointParameters
) {
  if (params.kind === ActionKind.GetServerPubkey) {
    return getEndpointKeypair().publicKey.toBase58();
  } else if (params.kind === ActionKind.ValidateTransaction) {
    const picketKey = process.env['PICKET_SECRET_KEY'];
    const picket = new Picket(picketKey);

    try {
      await picket.validate(params.accessToken);
      // TODO verify token ownership requirements
      // https://docs.picketapi.com/picket-docs/reference/concepts/access-tokens#3.-optional-verify-token-ownership-requirements
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  } else {
    throw 'unhandled';
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

    const result = await action(params);

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

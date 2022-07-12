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
import {
  Metaplex
} from '@metaplex-foundation/js';


export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse
) {
  // Initialize connection
  const connection = new Connection(clusterApiUrl('mainnet-beta'));

  const pkey = new PublicKey(
    'BJ5je1jGK6Rx3QgwURxoMRMgXoEwhHAM8dEm6ZNgtXdM'
    // '9LGbdHLxcownBcNCojCfCzQc7zjW8tioXWTBMHmJaxsn'
    // 'EA8XRNbRB7Y228fJSEh2XRy14ZNE3m68DrQHnkGPThnu'
  );
  console.log(pkey);

  try {
    // TODO check all these fields
    const parsed: EndpointParameters = JSON.parse(request.body);

    let result: any

    switch(parsed.kind) {
      case ActionKind.ValidateTransaction:
        const {
          userKey,
          collectionKey
        } = parsed;

        const pkey = new PublicKey(
          'BJ5je1jGK6Rx3QgwURxoMRMgXoEwhHAM8dEm6ZNgtXdM'
        );


        //TODO use metaplex api here
        result = await connection.getTokenAccountsByOwner(
          pkey,
          { programId: TOKEN_PROGRAM_ID }
        );

        break;
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

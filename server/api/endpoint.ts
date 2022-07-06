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
  const conn = new Connection(clusterApiUrl('devnet'));

  try {
    // TODO check all these fields
    const parsed: EndpointParameters = JSON.parse(request.body);

    let result: any

    if (parsed.kind === ActionKind.CreateForum) {
      const { userPubkeyBase58 } = parsed;

      result = await confirmPayment(
        conn,
        '3Gi1rsg89hgtNQMPCZLQVoYw6jREw8Cg4VWXaQeU4397mGnuvYqdkmDsoaj98WiZLT4ZeTGb9JdYwBRxMPPD8CVE',
        userPubkeyBase58,
      );

      // TODO create forum here
    } else if (parsed.kind === ActionKind.GetServerPubkey) {
      result = getEndpointKeypair().publicKey.toBase58();
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
  userPubkeyBase58: string,
  recipientPubkeyBase58: string = getEndpointKeypair().publicKey.toBase58(),
  n: Number = 50000
): Promise<boolean> {
  const tx = await connection.getParsedTransaction(txid);
  const instructions =  tx!.transaction.message.instructions;

  // There must be some instruction that pays enough from user to
  // recipient
  // TODO handle partially-decoded data
  // TODO confirm that this payment happened recently
  return instructions.some(inst =>
    // Instruction is well-formed
    'parsed' in inst                                       &&
    'info' in inst.parsed                                  &&
    // Instruction is a transfer
    inst.parsed.type             === 'transfer'            &&
    // Instruction is from the correct user and to the correct
    // recipient
    inst.parsed.info.source      === userPubkeyBase58      &&
    inst.parsed.info.destination === recipientPubkeyBase58 &&
    // Instruction pays enough
    inst.parsed.info.lamports    >=  n
  );
}

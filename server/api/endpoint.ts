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

    if (parsed.kind === ActionKind.CreateForum) {
      const {
        userPubkeyBase58,
        txid,
        identifier
      } = parsed;
      const userPubkey = new PublicKey(userPubkeyBase58);
      const endpointKey = getEndpointKeypair();

      // Did the user pay enough?
      const transactionValid = await confirmPayment({
        connection,
        txid,
        senderPubkey: userPubkey,
        lamports: CREATE_OFFLOADBOX_FEE
      });

      if (transactionValid) {
        // TODO create forum here
        const endpointWallet = new KeyPairWallet(endpointKey);
        await offloadbox.createOffloadbox(
          connection,
          endpointWallet,
          identifier
        );

        result = await offloadbox.fetchOffloadbox(
          connection,
          endpointWallet,
          identifier
        );
      } else {
        result = false;
      }

    } else if (parsed.kind === ActionKind.GetServerPubkey) {
      result = getEndpointKeypair().publicKey.toBase58();
    }

    response.end(JSON.stringify({result}));
  } catch(e) {
    console.error(e);
    response.end(JSON.stringify({
      error: e.toString()
    }));
  }
}

interface ConfirmPaymentParameters {
  connection: Connection;
  txid: string;
  senderPubkey: PublicKey;
  receiverPubkey?: PublicKey;
  lamports?: number;
}
/*
 * Confirm that a user paid at least n lamports
 */
async function confirmPayment({
  connection,
  txid,
  senderPubkey,
  receiverPubkey = getEndpointKeypair().publicKey,
  lamports = 50000
}: ConfirmPaymentParameters): Promise<boolean> {
  const tx = await connection.getParsedTransaction(
    txid,
    'confirmed'
  );
  const instructions =  tx!.transaction.message.instructions;
  // @ts-ignore
  console.log(instructions[0].parsed.info.lamports, lamports);

  // There must be some instruction that pays enough from user to
  // recipient
  // TODO handle partially-decoded data
  // TODO confirm that this payment happened recently
  return instructions.some(inst =>
    // Instruction is well-formed
    'parsed' in inst                                           &&
    'info' in inst.parsed                                      &&
    // Instruction is a transfer
    inst.parsed.type             === 'transfer'                &&
    // Instruction is from the correct user and to the correct
    // recipient
    inst.parsed.info.source      === senderPubkey.toBase58()   &&
    inst.parsed.info.destination === receiverPubkey.toBase58() &&
    // Instruction pays enough
    inst.parsed.info.lamports    >=  lamports
  );
}

import {
  Container,
  Button,
  Form,
  Row,
  Col
} from 'react-bootstrap';
import { useState } from 'react';
import { ActionKind } from '../types';
import { postEndpoint } from '../utils';
import {
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  PublicKey
} from '@solana/web3.js';
import {
  useWallet,
  useConnection
} from '@solana/wallet-adapter-react';

export function Content() {
  return (
    <Container>
      <CreateForm />
    </Container>
  );
}

function CreateForm() {
  const [identifier, setIdentifier] = useState('');
  const wallet = useWallet();
  const { connection } = useConnection();

  async function createForum() {
    const tx = new Transaction();

    tx.add(SystemProgram.transfer({
      fromPubkey: wallet.publicKey!,
      // TODO don't hardcode this
      toPubkey: new PublicKey('8NSUiHk3tPk7bbgxfDU1ZvAG8AdQHf7fjsu43DvQLrRD'),
      lamports: 100 //CREATE_OFFLOADBOX_FEE;
    }));

    const signature = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction(signature, 'confirmed')
    console.log(signature);

    postEndpoint({
      kind: ActionKind.CreateForum,
      userPubkeyBase58: wallet.publicKey!.toBase58(),
      txid: signature
    });
  }

  return (
    <Col>
      <Row>
        <Form.Control
          type='text'
          onChange={e => setIdentifier(e.target.value)}
          value={identifier}
        />
      </Row>
      <Row>
        <Button
          onClick={() => { createForum(); }}
        >Create forum</Button>
      </Row>
    </Col>
  );
}

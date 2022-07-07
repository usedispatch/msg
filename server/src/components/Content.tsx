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
  sendAndConfirmTransaction
} from '@solana/web3.js';
import {
  useWallet,
  useConnection
} from '@solana/wallet-adapter-react';
import {
  ENDPOINT_PUBLIC_KEY
} from '../../../usedispatch_client';

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
  const connection = useConnection();

  async function createForum() {
    const tx = new Transaction();

    tx.add(SystemProgram.transfer({
      fromPubkey: wallet.publicKey!,
      toPubkey: ENDPOINT_PUBLIC_KEY,
      lamports: 100 //CREATE_OFFLOADBOX_FEE;
    }));

    const signed = await wallet.signTransaction!(tx);
    await wallet.sendTransaction(signed, connection.connection);

    postEndpoint({
      kind: ActionKind.CreateForum,
      userPubkeyBase58: wallet.publicKey!.toBase58(),
      txid: 'TODO here'
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

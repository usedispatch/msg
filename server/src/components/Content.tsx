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
import { useWallet } from '@solana/wallet-adapter-react';

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
          onClick={() => {
            postEndpoint({
              kind: ActionKind.CreateForum,
              userPubkeyBase58: wallet.publicKey!.toBase58()
            });
          }}
        >Create forum</Button>
      </Row>
    </Col>
  );
}

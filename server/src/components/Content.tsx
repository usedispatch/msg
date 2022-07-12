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
  PublicKey
} from '@solana/web3.js';
import {
  useWallet,
  useConnection
} from '@solana/wallet-adapter-react';

function handler() {
  postEndpoint({
    kind: ActionKind.ValidateTransaction,
    accessToken: 'not a valid token'
  });
}

export function Content() {
  const wallet = useWallet();
  return (
    <Container>
      <Button
        onClick={handler}
      >
        yo
      </Button>
    </Container>
  );
}

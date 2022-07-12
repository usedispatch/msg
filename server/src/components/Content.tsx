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
import Picket from '@picketapi/picket-js';

async function handler() {
  const picket = new Picket('pk_f0bb0552641c86e8ca1b2ec9b97c3b19');
  const { accessToken, user } = await picket.login({
    chain: 'solana'
  })
  console.log(
    'hello',
    accessToken,
    user
  );
  postEndpoint({
    kind: ActionKind.ValidateTransaction,
    accessToken
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

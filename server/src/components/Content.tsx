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
import { } from '@usedispatch/client';

export function Content() {
  const wallet = useWallet();
  return (
    <Container>
      <Button
        onClick={() => {
          postEndpoint({
            kind: ActionKind.ValidateTransaction,
            userKey: 'BJ5je1jGK6Rx3QgwURxoMRMgXoEwhHAM8dEm6ZNgtXdM',
            collectionKey: wallet.publicKey!.toBase58()
          });
        }}
      >
        yo
      </Button>
    </Container>
  );
}

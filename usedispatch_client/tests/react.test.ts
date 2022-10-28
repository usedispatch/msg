/**
 * @jest-environment jsdom
 */
import * as web3 from '@solana/web3.js';
import React from 'react';
import * as tlr from '@testing-library/react';
import { Mailbox, KeyPairWallet } from "../src/";
import '@testing-library/jest-dom';

interface IState {
  receiverMailbox?: Mailbox;
}

const keypair: web3.Keypair = web3.Keypair.generate();

class WalletComponent extends React.Component<{}, IState> {
  constructor(props: {}) {
    super(props);
    const conn = new web3.Connection(web3.clusterApiUrl('devnet'));
    const receiver = keypair;
    console.log('receiver', receiver.publicKey.toBase58());
    const receiverWallet = new KeyPairWallet(receiver);
    const receiverMailbox = new Mailbox(conn, receiverWallet);
    this.state = {
      receiverMailbox
    };
    }
  render() {
    const mailboxAddress = this.state?.receiverMailbox?.mailboxOwner.toBase58() ?? "";
    return (
      React.createElement('div', null, `Wallet owner: ${mailboxAddress}`)
    );
  }
}

describe("Test for creating Mailbox in react.", () => {
  describe("reactTest", () => {
      test("Create mailbox in react", async () => {
        const element = new WalletComponent({});
        const component = tlr.render(element.render());
        tlr.screen.debug();
        await tlr.waitFor(() => tlr.screen.getByText(/Wallet owner:/));

        expect(tlr.screen.getByText(`Wallet owner: ${keypair.publicKey.toBase58()}`)).toBeInTheDocument();
      })
  })
})

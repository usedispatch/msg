import {
  Container,
  Navbar,
  Nav
} from 'react-bootstrap';
import { WalletMultiButton, WalletDisconnectButton } from '@solana/wallet-adapter-react-ui';

export function Header() {
  return (
    <Navbar>
      <Container>
        <Navbar.Brand>
          <Nav.Link>Arweave Endpoint Demo</Nav.Link>
        </Navbar.Brand>
        <Nav>
          <Nav.Item><WalletMultiButton /></Nav.Item>
          <Nav.Item><WalletDisconnectButton /></Nav.Item>
        </Nav>
      </Container>
    </Navbar>
  );
}

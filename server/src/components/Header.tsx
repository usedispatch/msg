import {
  Container,
  Navbar,
  Nav
} from 'react-bootstrap';
export function Header() {
  return (
    <Navbar>
      <Container>
      <Navbar.Brand>
        <Nav.Link>Arweave Endpoint Demo</Nav.Link>
      </Navbar.Brand>
      </Container>
    </Navbar>
  );
}

import {
  Container,
  Button,
  Form,
  Row,
  Col
} from 'react-bootstrap';
import { useState } from 'react';

export function Content() {
  return (
    <Container>
      <CreateForm />
    </Container>
  );
}

function CreateForm() {
  const [identifier, setIdentifier] = useState('');
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
        <Button>Create forum</Button>
      </Row>
    </Col>
  );
}

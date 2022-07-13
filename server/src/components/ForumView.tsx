import {
  Container,
  Card
} from 'react-bootstrap';
import {
  useParams
} from 'react-router-dom';

export function ForumView() {
  const { identifier } = useParams();
  return (
    <Container>
      <h1>Forum: {identifier}</h1>
      <hr />
    </Container>
  );
};

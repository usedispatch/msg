import {
  Container,
  Card
} from 'react-bootstrap';
import {
  useParams
} from 'react-router-dom';

export function ForumView() {
  const { identifier } = useParams();

  const posts = ['one', 'two', 'three'];

  return (
    <Container>
      <h1>Forum: {identifier}</h1>
      <hr />
      {posts.map(text =>
      <Card>
        <Card.Body>
          <Card.Text>{text}</Card.Text>
        </Card.Body>
      </Card>
      )}
    </Container>
      );
};

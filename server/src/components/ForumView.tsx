import {
  useEffect,
  useState
} from 'react';
import {
  Container,
  Card
} from 'react-bootstrap';
import {
  useParams
} from 'react-router-dom';
import axios from 'axios'; 

async function handler() {
  const resp = await axios({
    url: 'https://arweave.dev/graphql',
    method: 'post',
    data: {
      query: `{
    transactions(first: 160, 
      tags: [
        {
          name: "App-Name",
          values: ["PublicSquare"]
        },
        {
          name: "Content-Type",
          values: ["text/plain"]
        },

      ]
    ) {
      edges {
        node {
          id
          data {
            size
          }
          tags {
            name,
            value
          }
        }
      }
    }
  }`
    }
  });

  const edges = resp.data.data.transactions.edges as { node: { id: string }}[]
  return edges.map(edge => edge.node.id);
}

export function ForumView() {
  const { identifier } = useParams();

  useEffect(() => {
    handler()
      .then(ids => setPosts(ids));
  }, []);

  const [posts, setPosts] = useState<string[]>([]);

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

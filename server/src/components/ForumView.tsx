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
import Arweave from 'arweave';

async function fetchAddresses() {
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

  const [addresses, setAddresses] = useState<string[]>([]);
  const [posts, setPosts] = useState<string[]>([]);

  useEffect(() => {
    fetchAddresses()
      .then(ids => setAddresses(ids));
  }, []);

  useEffect(() => {
    const arweave = Arweave.init({
      host: 'arweave.net',
      port: 443,
      protocol: 'https'
    });
    const promises = addresses.map(address => {
      // TODO check this for injection
      return arweave.transactions.getData(address, {decode: true, string: true});
    });
    Promise.allSettled(promises)
      .then(res => res.filter(item => item.status === 'fulfilled'))
      .then(res => res.map(item => item as PromiseFulfilledResult<string>))
      .then(res => res.map(item => item.value))
      .then(successes => setPosts(successes));
  }, [addresses]);

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

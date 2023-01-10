[![Build and Test Solana Programs and usedispatch library](https://github.com/0xengage/msg/actions/workflows/rust.yml/badge.svg)](https://github.com/0xengage/msg/actions/workflows/rust.yml)

### Setup

#### One-time

1. `yarn` - Install JS packages
1. `anchor build && anchor test`
1. `cd usedispatch_client/ && npm install`
1. `npm run test`

#### After every change

1. `anchor build && anchor test`
1. `cd usedispatch_client/ && npm run test && cd ..`

## Using the library

Here is some example code on how you might interact with the library. For more details, see the [[postbox docs](https://docs.dispatch.forum/docs/developer/postbox)].

```typescript
import { Postbox, DispatchConnection } from '@usedispatch/msg';

const targetKey = new web.PublicKey(DEGEN_APE_COLLECTION_KEY);
const dispatchConn = new DispatchConnection(web3Conn, wallet);
const postbox = new Postbox({key: targetKey});

// Interact with the postbox

// Get all of the topics
const topics = await postbox.fetchPosts();
const firstTopic = topics[0];
// Get the posts in that topic
const postsInTopic = await postbox.fetchReplies(firstTopic);
// Check that the wallet we used is allowed to write to this topic
if (postbox.canPost(firstTopic)) {
  // Add a new post
  await postbox.createPost({
    subj: 'This topic is amazing',
    body: 'Thank you so much for creating it',
  }, firstTopic);
  // Vote up on the first post in the topic
  await postbox.vote(postsInTopic[0], true);
}
```
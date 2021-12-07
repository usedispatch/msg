Usage:

```ts
// Initialize mailbox for `receiver` address
const mailbox = new Mailbox(conn, { receiver, payer, });

// Send messages
await mailbox.send("text0");
await mailbox.send("text1");

// Fetch messages
const messages = await mailbox.fetch();

// If `receiver` is a Keypair, can call pop to close
// message accounts and retrieve rent (goes to receiver)
await mailbox.pop();
await mailbox.pop();
```

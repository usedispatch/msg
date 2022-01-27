### Setup

1. `yarn` - Install JS packages
1. `cargo build` - Install Rust deps
1. `cargo install --git https://github.com/project-serum/anchor --tag v0.20.1 anchor-cli --locked` - Install [Anchor](https://project-serum.github.io/anchor/getting-started/installation.html#build-from-source-for-other-operating-systems)
1. `anchor build`
1. `cd 0xengage_client/ && yarn && cd ..`

### Usage

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

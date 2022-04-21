[![Build and Test Solana Program, usedispatch library, and usedispatch CLI](https://github.com/0xengage/msg/actions/workflows/rust.yml/badge.svg)](https://github.com/0xengage/msg/actions/workflows/rust.yml)

### Setup

#### One-time

1. `yarn` - Install JS packages
1. `cargo build` - Install Rust deps
1. `cargo install --git https://github.com/project-serum/anchor --tag v0.24.2 anchor-cli --locked` - Install [Anchor](https://project-serum.github.io/anchor/getting-started/installation.html#build-from-source-for-other-operating-systems)
1. `anchor test`
1. `cd usedispatch_client/ && npm install`
1. `npm run test`
1. `cd ../usedispatch_cli`
1. `npm install && cd ..`

### After every change

1. `anchor build && anchor test`
1. `cd usedispatch_client/ && npm run test && cd ..`

### Usage

```ts
// Initialize mailbox for `wallet`
const mailbox = new Mailbox(conn, wallet);

// Send messages
await mailbox.send("text0", receiver);
await mailbox.send("text1", receiver);

// Fetch messages
const messages = await mailbox.fetch();

// Call pop to close message accounts and return rent
// (goes to original payer)
await mailbox.pop();
await mailbox.pop();
```

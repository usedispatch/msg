[![Build and Test Solana Programs and usedispatch library](https://github.com/0xengage/msg/actions/workflows/rust.yml/badge.svg)](https://github.com/0xengage/msg/actions/workflows/rust.yml)

### Setup

#### One-time

1. `yarn` - Install JS packages
1. `anchor build && anchor test`
1. `cd usedispatch_client/ && npm install`
1. `npm run test`

### After every change

1. `anchor build && anchor test`
1. `cd usedispatch_client/ && npm run test && cd ..`


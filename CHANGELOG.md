# Changelog

## [Unreleased]

### Features

* program, client: Upgrade to anchor 0.22.0. ([#23](https://github.com/usedispatch/msg/pull/23))
* program, client: Deployment to mainnet. ([#25](https://github.com/usedispatch/msg/pull/25))
* program: Include seed hints to enable use of anchor method API ([#25](https://github.com/usedispatch/msg/pull/25))

### Breaking

* client: Use wallets instead of private keys. ([#24](https://github.com/usedispatch/msg/pull/24))
* program: Calculate message PDA using mailbox instead of receiver. ([#25](https://github.com/usedispatch/msg/pull/25))
* program: Enforce sender as signer (DIP 1) ([#26](https://github.com/usedispatch/msg/pull/26))

## [0.0] 2021-12-01

### Includes

* Mailbox and message accounts.
* Simple TS client for using the protocol.
* Simple CLI for demo/testing the protocol.

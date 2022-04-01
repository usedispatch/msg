# Changelog

## [Unreleased]

## [0.5.0] 2022-03-31

### Features

* client: Use fewer RPC requests when fetching the full mailbox ([#31](https://github.com/usedispatch/msg/pull/31))
* program, client: Support random deletes and incentives with messages ([#32](https://github.com/usedispatch/msg/pull/32))

## [0.4.0] 2022-03-17

### Features

* client: Obfuscation support ([#30](https://github.com/usedispatch/msg/pull/30))

## [0.3.0] 2022-03-07

### Features

* client: Tests for react usage ([#27](https://github.com/usedispatch/msg/pull/27))
* client: Support wallet adapter interface in addition to anchor wallet ([#28](https://github.com/usedispatch/msg/pull/28))
* client: Subscriptions for events and getMessageById ([#29](https://github.com/usedispatch/msg/pull/29))

## [0.2.0] 2022-02-27

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

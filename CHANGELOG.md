# Changelog

## [Unreleased]

## [0.7.0] 2022-04-22

### Features

* client: New JSON-based rich message format with extensibility ([#37](https://github.com/usedispatch/pull/37))
* client: Keep fetch around for deprecated uses ([#41](https://github.com/usedispatch/msg/pull/41))
* client: Properties for incentive mint and method to get incentive amount ([#42](https://github.com/usedispatch/msg/pull/42))
* client, program: Upgrade anchor to 0.24.2 ([#43](https://github.com/usedispatch/msg/pull/43))
* program: Do not delete message when claiming incentive ([#40](https://github.com/usedispatch/pull/40))

## [0.6.0] 2022-04-08

### Features

* client: Fetch messages sent to an address, and method to delete a given message ([#36](https://github.com/usedispatch/pull/36))
* client: Fix obfuscation bug when reading sent messages ([#38](https://github.com/usedispatch/msg/pull/38))

## [0.5.1] 2022-03-31

### Features

* client: Sent message subsciptions ([#33](https://github.com/usedispatch/msg/pull/33))

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

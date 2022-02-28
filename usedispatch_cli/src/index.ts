#!/usr/bin/env node

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as web3 from '@solana/web3.js';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

import * as dispatch from '@usedispatch/client';

const getLocalConn = (cluster: web3.Cluster) => {
  console.log(`Using cluster ${cluster}`);
  return new web3.Connection(web3.clusterApiUrl(cluster));
};

const getLocalWallet = (): dispatch.KeyPairWallet => {
  const walletFile = process.env.WALLET_FILE || path.join(os.homedir(), '.config', 'solana', 'id.json');
  const secretKeyString = fs.readFileSync(walletFile, 'utf-8');
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  const keypair = web3.Keypair.fromSecretKey(secretKey);
  const wallet = new dispatch.KeyPairWallet(keypair);
  return wallet;
};

const sendMessage = async (cluster: web3.Cluster, receiver: string, message: string) => {
  const conn = getLocalConn(cluster);
  const wallet = getLocalWallet();
  const mailbox = new dispatch.Mailbox(conn, wallet);
  const trans = await mailbox.send(message, new web3.PublicKey(receiver));
  console.log(`success: ${trans}`);
};

const listMessages = async (cluster: web3.Cluster) => {
  const conn = getLocalConn(cluster);
  const wallet = getLocalWallet();
  const mailbox = new dispatch.Mailbox(conn, wallet);
  const messages = await mailbox.fetch();
  console.log(`${messages.length} total message(s)`);
  messages.forEach((message) => {
    console.log(`${message.sender} ${message.data}`);
  });
};

const popMessage = async (cluster: web3.Cluster) => {
  const conn = getLocalConn(cluster);
  const wallet = getLocalWallet();
  const mailbox = new dispatch.Mailbox(conn, wallet);
  const count = await mailbox.count();
  if (count === 0) {
    console.log('No messages remaining to pop');
  } else {
    const trans = await mailbox.pop();
    console.log(`success: ${trans}`);
    const remaining = count - 1;
    console.log(`${remaining} message(s) left`);
  }
};

export const processArgs = () => {
  yargs(hideBin(process.argv))
    .option('cluster', {
      choices: ['mainnet-beta', 'devnet', 'testnet'] as const,
      default: 'mainnet-beta',
    })
    .command(
      'send <address> <message>',
      'Send a message',
      (yargs2) => {
        return yargs2
          .positional('address', {
            describe: 'Base58 address to send message to',
            type: 'string',
            demandOption: true,
          })
          .positional('message', {
            describe: 'Message to send (as string)',
            type: 'string',
            demandOption: true,
          });
      },
      async (argv) => {
        await sendMessage(argv.cluster as web3.Cluster, argv.address, argv.message);
      },
    )
    .command(
      'list',
      'show available messages',
      (yargs2) => {
        return yargs2;
      },
      async (argv) => {
        await listMessages(argv.cluster as web3.Cluster);
      },
    )
    .command(
      'pop',
      'display and delete oldest message',
      (yargs2) => {
        return yargs2;
      },
      async (argv) => {
        await popMessage(argv.cluster as web3.Cluster);
      },
    )
    .demandCommand(1, 'A command is required')
    .help()
    .parse();
};

processArgs();

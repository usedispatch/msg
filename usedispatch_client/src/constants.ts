// TODO: codegen this file
import * as web3 from '@solana/web3.js';

export type DispatchAddresses = {
  programAddress: web3.PublicKey;
  treasuryAddress: web3.PublicKey
}

export const seeds = {
  protocolSeed: Buffer.from("messaging"),
  mailboxSeed: Buffer.from("mailbox"),
  messageSeed: Buffer.from("message"),
};

export const clusterAddresses = new Map<web3.Cluster, DispatchAddresses>();

clusterAddresses.set("devnet", {
  programAddress: new web3.PublicKey("BHJ4tRcogS88tUhYotPfYWDjR4q7MGdizdiguY3N54rb"),
  treasuryAddress: new web3.PublicKey("G2GGDc89qpuk21WgRUVPDY517uc6qR5yT4KX7AakyVR1"),
});

clusterAddresses.set("mainnet-beta", {
  programAddress: new web3.PublicKey("BHJ4tRcogS88tUhYotPfYWDjR4q7MGdizdiguY3N54rb"),
  treasuryAddress: new web3.PublicKey("5MNBoBJDHHG4pB6qtWgYPzGEncoYTLAaANovvoaxu28p"),
});

export const defaultCluster: web3.Cluster = "devnet";

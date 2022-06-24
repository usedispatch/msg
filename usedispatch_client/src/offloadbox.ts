import * as web3 from '@solana/web3.js';
import { DispatchConnection } from './connection'

export interface Offloadbox {
  address: web3.PublicKey;
};

export function initialize(
  owner: web3.PublicKey,
  connection: DispatchConnection
) {
  // TODO invoke this program
  // connection.offloadboxProgram
}

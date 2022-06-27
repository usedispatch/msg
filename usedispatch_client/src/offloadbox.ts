import * as web3 from '@solana/web3.js';
import { DispatchConnection } from './connection'

export interface Offloadbox {
  address: web3.PublicKey;
};

/**
 * This function initializes a new offloadbox using the publicKey
 * associated with the current connection
 * The offloadbox
 */
export function initialize(
  connection: DispatchConnection
) {
  // TODO invoke this program
  // connection.offloadboxProgram
}

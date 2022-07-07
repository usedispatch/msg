/**
 * A list of constants for use with the experimental new endpoint
 * design
 *
 * All fees in lamports
 */
import { PublicKey } from '@solana/web3.js';

/** One sol is 10e9 lamports */
export const SOL = 10e9;

/**
 * 1.5 SOL to create a postbox
 * TODO make this dynamic depending on how many posts a user buys
 */
export const CREATE_OFFLOADBOX_FEE = 1.5 * SOL;

/**
 * This number chosen relatively arbitrarily, TODO make it better
 */
export const CREATE_POST_FEE = 30000;

/**
 * The public key of the endpoint
 */
export const ENDPOINT_PUBLIC_KEY = new PublicKey('8NSUiHk3tPk7bbgxfDU1ZvAG8AdQHf7fjsu43DvQLrRD');

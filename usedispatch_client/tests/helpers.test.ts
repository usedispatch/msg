import * as web3 from '@solana/web3.js';
import { Key } from '@metaplex-foundation/mpl-token-metadata';
import {
  getMintsForOwner,
  getMetadataForOwner
} from '../src/utils';

describe('Test helper functions', () => {
  let conn: web3.Connection;

  beforeAll(() => {
    conn = new web3.Connection(web3.clusterApiUrl('mainnet-beta'));
  });

  test('Get V1 metadata for user', async () => {

    // A trash panda holder I found. TODO replace this with a
    // test wallet under our control
    const publicKey = new web3.PublicKey('7ycUFfnspMwnjp2DfSjAvZgf7g7T6nugrGv2kpzogrNC');

    const mints = await getMintsForOwner(conn, publicKey);

    // Make sure our mints are correct
    expect(mints).toEqual(
      expect.arrayContaining([
        new web3.PublicKey('9pSeEsGdnHCdUF9328Xdn88nMmzWUSLAVEC5dWgPvM3Q'),
        new web3.PublicKey('DTPMARh15YSqggNbMLECj8RxVoxfhtobyyCLiwEeVwZu')
      ])
    );

    // Now, get the Metadata for the user...
    // And assert that it owns an item in the trash panda
    // collection
    const metadata = await getMetadataForOwner(conn, publicKey);
    // Assert that the raccon mint can be found
    const raccoonOrUndefined = metadata.find(({ mint }) =>
      mint.toBase58() === '9pSeEsGdnHCdUF9328Xdn88nMmzWUSLAVEC5dWgPvM3Q');
    // Raccoon should be defined
    expect(raccoonOrUndefined).not.toBeUndefined();
    // Now assert we have it
    const raccoon = raccoonOrUndefined!;
    // Test the raccoon's properties
    expect(raccoon.key).toEqual(Key.MetadataV1);
    expect(raccoon.collection).not.toBeNull();
    const collection = raccoon.collection!;
    expect(collection.verified).toBe(true);
    expect(collection.key).toEqual(
      new web3.PublicKey('GoLMLLR6iSUrA6KsCrFh7f45Uq5EHFQ3p8RmzPoUH9mb')
    );
  });

  // test('Test cardinal.so metadata', async () => {
  //   const dispatchKey = new web3.PublicKey('EuoVktg82q5oxEA6LvLXF4Xi9rKT1ZrjYqwcd9JA7X1B');
  //   
  //   const metadata = await getMetadataForOwner(conn, dispatchKey);
  //   console.log('mdata', metadata);
  // });

  afterAll(() => {
    // Wait for six seconds, for the connection to close down
    // TODO remove this waiting when https://github.com/solana-labs/solana/issues/25069 is resolved
    Atomics.wait(
      new Int32Array(new SharedArrayBuffer(4)),
      0, 0,
      6 * 1000
    );
  });
});

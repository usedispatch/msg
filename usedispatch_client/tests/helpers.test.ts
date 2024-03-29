import * as web3 from '@solana/web3.js';
import { Key, Metadata } from '@metaplex-foundation/mpl-token-metadata';
import { Error } from '../src/types';
import { getMintsForOwner, getMetadataForOwner, getMetadataForMint } from '../src/utils';

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
        new web3.PublicKey('DTPMARh15YSqggNbMLECj8RxVoxfhtobyyCLiwEeVwZu'),
      ]),
    );

    // Now, get the Metadata for the user...
    // And assert that it owns an item in the trash panda
    // collection
    const metadata = await getMetadataForOwner(conn, publicKey);
    // Assert that the raccon mint can be found
    const raccoonOrUndefined = metadata.find(
      ({ mint }) => mint.toBase58() === '9pSeEsGdnHCdUF9328Xdn88nMmzWUSLAVEC5dWgPvM3Q',
    );
    // Raccoon should be defined
    expect(raccoonOrUndefined).not.toBeUndefined();
    // Now assert we have it
    const raccoon = raccoonOrUndefined!;
    // Test the raccoon's properties
    expect(raccoon.key).toEqual(Key.MetadataV1);
    expect(raccoon.tokenStandard).toBeNull();
    expect(raccoon.collection).not.toBeNull();
    const collection = raccoon.collection!;
    expect(collection.verified).toBe(true);
    expect(collection.key).toEqual(new web3.PublicKey('GoLMLLR6iSUrA6KsCrFh7f45Uq5EHFQ3p8RmzPoUH9mb'));
  });

  test('Test cardinal.so metadata', async () => {
    const cardinalTokenMint = new web3.PublicKey('3MZRqiVc8AxsFwsnySkwmeT1RWxz8sUDHBSzgeZB7bRc');

    const metadataOrError = await getMetadataForMint(conn, cardinalTokenMint);
    expect(metadataOrError).not.toHaveProperty('error');

    const metadata = metadataOrError as Metadata;
    expect(metadata.key).toBe(Key.MetadataV1);
    expect(metadata.tokenStandard).toBeNull();
    expect(metadata.collection).toBeNull();
    expect(metadata.mint).toEqual(cardinalTokenMint);
  });

  test('Get account without any metadata', async () => {
    const confusingMint = new web3.PublicKey('HxNTUR6YEixfzJbxCR1xjDH6sTGLrAACnKEhHEoWdrf');
    const metadataOrError = await getMetadataForMint(conn, confusingMint);
    expect(metadataOrError).toHaveProperty('error');

    const error = metadataOrError as Error;
    expect(error.error).toBe(true);
  });

  test('Fetch NFTs from Dispatch wallet', async () => {
    const dispatchKey = new web3.PublicKey('EuoVktg82q5oxEA6LvLXF4Xi9rKT1ZrjYqwcd9JA7X1B');
    const metadataList = await getMetadataForOwner(conn, dispatchKey);

    // Should have at least one metadata
    expect(metadataList.length).toBeGreaterThan(0);

    const nftOrUndefined = metadataList.find(
      ({ mint }) => mint.toBase58() === '3MZRqiVc8AxsFwsnySkwmeT1RWxz8sUDHBSzgeZB7bRc',
    );

    expect(nftOrUndefined).not.toBeUndefined();

    const nft = nftOrUndefined!;
    expect(nft.mint).toEqual(new web3.PublicKey('3MZRqiVc8AxsFwsnySkwmeT1RWxz8sUDHBSzgeZB7bRc'));
    expect(nft.collection).toBeNull();
    expect(nft.tokenStandard).toBeNull();
    expect(nft.collection).toBeNull();
    expect(nft.data.symbol.replace(/\0/g, '')).toEqual('NAME');
    expect(nft.data.name.replace(/\0/g, '')).toEqual('usedispatch.twitter');
  });

  afterAll(() => {
    // Wait for six seconds, for the connection to close down
    // TODO remove this waiting when https://github.com/solana-labs/solana/issues/25069 is resolved
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 6 * 1000);
  });
});

import * as anchor from '@project-serum/anchor';
import { strict as assert } from 'assert';

import { DispatchConnection, clusterAddresses } from '../usedispatch_client/src';

describe('offloadbox', () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const conn = anchor.getProvider().connection;
  const TREASURY = clusterAddresses.get('devnet').treasuryAddress;

  it('Initializes an offloadbox', async () => {
    // TODO
  });
});

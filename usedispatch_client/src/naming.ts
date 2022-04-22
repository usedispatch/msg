import { getHashedName, getNameAccountKey, NameRegistryState } from '@bonfida/spl-name-service';

import * as web3 from '@solana/web3.js';

/* Bonfida naming support
 */

const ROOT_TLD_AUTHORITY = new web3.PublicKey('ZoAhWEqTVqHVqupYmEanDobY7dee5YKbQox9BNASZzU');
const SOL_TLD_AUTHORITY = new web3.PublicKey('58PwtjSDuFHuUkYjH9BYnnQKHfwo9reZhC2zMJv9JPkx');

export type DotSolLookup = {
  ownerPubKey: web3.PublicKey | undefined;
};

export const lookupDotSol = async (conn: web3.Connection, solDomainName: string): Promise<DotSolLookup> => {
  const hashedName = await getHashedName(solDomainName);
  const domainKey = await getNameAccountKey(hashedName, undefined, SOL_TLD_AUTHORITY);

  // The retrieve method returns an object made of two fields:
  // - registry is of type NameRegistryState
  // - nftOwner is of type PublicKey | undefined

  const { registry, nftOwner } = await NameRegistryState.retrieve(conn, domainKey);

  const res: DotSolLookup = { ownerPubKey: undefined };

  if (nftOwner !== undefined) {
    // Domain is tokenized, which means the nftOwner pubkey is the owner of the domain NFT
    // All funds and messages should be sent here to nftOwner themselves.
    res.ownerPubKey = nftOwner;
  } else if (nftOwner === undefined) {
    // Domain is not tokenized, so the funds or messages should be sent to registry.owner
    res.ownerPubKey = registry.owner;
  }

  return res;
};

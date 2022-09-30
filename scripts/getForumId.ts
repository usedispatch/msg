import * as anchor from '@project-serum/anchor';
import {
    DispatchConnection,
    Forum,
    ForumPost,
    getMetadataForOwner,
    Postbox
  } from "../usedispatch_client/src";
  import { chunk, concat } from 'lodash';

  
async function main() {
    const connection = new anchor.web3.Connection("http://api.mainnet-beta.solana.com", "confirmed"); 
    const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
    const addy = new anchor.web3.PublicKey("8Cwx4yR2sFAC5Pdx2NgGHxCk1gJrtSTxJoyqVonqndhq")
    const dispatchConnection = new DispatchConnection(connection, wallet);
    const account = await dispatchConnection.postboxProgram.account.postbox.fetch(new anchor.web3.PublicKey("AQcmnMdZz617fYE5FoNDR7nWoJqHWtugaRgmyL9DofxL"));
    // const postbox = new Postbox(dispatchConnection, "4TMHAPEjmLnu16iRYHS4D6MSUbp5qa2iKzALw7UTA2L1")
    // const key = postbox.get
    //@ts-ignore
    const restriction = account.settings[1].postRestriction.postRestriction
    // const canPost = await dispatchConnection.postboxProgram.
    // console.log()
    console.log(restriction) 
    if (restriction.nftOwnership) {
      const collectionId = restriction.nftOwnership.collectionId;
      const nftsOwned = await getMetadataForOwner(connection, addy);
      const relevantNfts = nftsOwned.filter((nft) => nft.collection?.key.equals(collectionId));
      console.log(relevantNfts)
      return relevantNfts.length > 0;
    }
}

main();     
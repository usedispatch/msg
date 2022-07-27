import * as anchor from '@project-serum/anchor';
import * as splToken from '@solana/spl-token';
import * as web3 from '@solana/web3.js';
import { seeds } from './constants';
import { DispatchConnection } from './connection';
import { getMintsForOwner, getMetadataForOwner, deriveMetadataAccount } from './utils';

export type PostboxTarget = {
  key: web3.PublicKey;
  str?: string;
};

export type EpochSeconds = number;

export type InputPostData = {
  subj?: string;
  body: string;
  meta?: any;
};

export type PostData = InputPostData & {
  ts: Date;
};

type ChainPostdata = {
  s?: string;
  b?: string;
  m?: any;
  t?: EpochSeconds;
};

export type PostNode = Post | Postbox;

export type Post = {
  parent: PostNode;
  address: web3.PublicKey;
  postId: number;
  poster: web3.PublicKey;
  data: PostData;
  upVotes: number;
  downVotes: number;
  replyTo?: web3.PublicKey;
  settings: SettingsAccountData[];
};

export type InteractablePost = {
  postId: number;
  address: web3.PublicKey;
  poster: web3.PublicKey;
  settings: SettingsAccountData[];
};

type ChainPost = {
  poster: web3.PublicKey;
  data: Buffer;
  upVotes: number;
  downVotes: number;
  replyTo: web3.PublicKey | null;
  settings: SettingsAccountData[];
};

type NullableChainPost = null | ChainPost;

type ChainPostboxInfo = {
  maxChildId: number;
  moderatorMint: web3.PublicKey;
  settings: any;
};

export type Description = {
  title: string;
  desc: string;
};

export type TokenPostRestriction = {
  mint: web3.PublicKey;
  amount: number;
};

export type NftPostRestriction = {
  collectionId: web3.PublicKey;
};

export type PostRestriction = {
  tokenOwnership?: TokenPostRestriction;
  nftOwnership?: NftPostRestriction;
};

type SettingsAccountData = {
  description?: Description;
  ownerInfo?: {
    owners: web3.PublicKey[];
  };
  postRestriction?: {
    postRestriction: PostRestriction;
  };
};

export enum SettingsType {
  ownerInfo = 'ownerInfo',
  description = 'description',
  postRestrictions = 'postRestriction',
}

export class Postbox {
  private _address: web3.PublicKey | undefined;

  constructor(public dispatch: DispatchConnection, public target: PostboxTarget) {}

  // Init functions
  async initialize(owners?: web3.PublicKey[], description?: Description): Promise<web3.TransactionSignature> {
    const ix = await this.dispatch.postboxProgram.methods
      .initialize(
        this.target.str ?? '',
        owners ?? [this.dispatch.wallet.publicKey!],
        description ? { description } : null,
      )
      .accounts({
        signer: this.dispatch.wallet.publicKey!,
        targetAccount: this.target.key,
        treasury: this.dispatch.addresses.treasuryAddress,
      })
      .transaction();
    return this.dispatch.sendTransaction(ix);
  }

  // Some helpers for basic commands

  async _getTokenPostRestrictionAccounts(tokenPostRestriction: TokenPostRestriction) {
    const ata = await splToken.getAssociatedTokenAddress(tokenPostRestriction.mint, this.dispatch.wallet.publicKey!);
    return {
      pra: [{ pubkey: ata, isWritable: false, isSigner: false }],
      praIdxs: { tokenOwnership: { tokenIdx: 0 } },
    };
  }

  async _getNftPostRestrictionAccounts(nftPostRestriction: NftPostRestriction) {
    const collectionId = nftPostRestriction.collectionId;
    const nftsOwned = await getMetadataForOwner(this.dispatch.conn, this.dispatch.wallet.publicKey!);
    const relevantNfts = nftsOwned.filter((nft) => nft.collection?.key.equals(collectionId));
    if (relevantNfts.length) {
      const nft = relevantNfts[0];
      const ata = await splToken.getAssociatedTokenAddress(nft.mint, this.dispatch.wallet.publicKey!);
      const metadataAddress = await deriveMetadataAccount(nft.mint);
      return {
        pra: [
          { pubkey: ata, isWritable: false, isSigner: false },
          { pubkey: metadataAddress, isWritable: false, isSigner: false },
          { pubkey: collectionId, isWritable: false, isSigner: false },
        ],
        praIdxs: { nftOwnership: { tokenIdx: 0, metaIdx: 1, collectionIdx: 2 } },
      };
    }
    return { pra: [], praIdxs: null };
  }

  async _getPostRestrictionAccounts(replyTo?: InteractablePost) {
    const restrictions = (replyTo?.settings ?? []).map(
      (s: SettingsAccountData) => s.postRestriction?.postRestriction || null,
    );
    // Put the postbox-wide restriction at the end so it's the default
    restrictions.push(await this.getPostboxPostRestriction());
    for (const restriction of restrictions) {
      if (restriction?.tokenOwnership) {
        return this._getTokenPostRestrictionAccounts(restriction.tokenOwnership);
      }
      if (restriction?.nftOwnership) {
        return this._getNftPostRestrictionAccounts(restriction.nftOwnership);
      }
    }
    return { pra: [], praIdxs: null };
  }

  _formatPostRestrictionSetting(postRestriction: PostRestriction) {
    // Normalizing means converting between number and anchor.BN
    let normalizedRestriction;
    if (postRestriction?.tokenOwnership) {
      normalizedRestriction = {
        tokenOwnership: {
          mint: postRestriction.tokenOwnership.mint,
          amount: new anchor.BN(postRestriction.tokenOwnership.amount),
        },
      };
    } else {
      normalizedRestriction = postRestriction;
    }
    return { postRestriction: { postRestriction: normalizedRestriction } };
  }

  // Basic commands
  async createPost(
    input: InputPostData,
    replyTo?: InteractablePost,
    postRestriction?: PostRestriction,
  ): Promise<web3.TransactionSignature> {
    // TODO(mfasman): make this be a better allocation algorithm
    const growBy = 1; // TODO(mfasman): pull from the IDL
    const maxId = (await this.getChainPostboxInfo()).maxChildId;
    const addresses = await this.getAddresses(maxId, Math.max(0, maxId - growBy));
    const infos = await this.dispatch.conn.getMultipleAccountsInfo(addresses);
    const data = await this.postDataToBuffer(input);
    const postRestrictions = await this._getPostRestrictionAccounts(replyTo);
    const ix = await this.dispatch.postboxProgram.methods
      .createPost(
        data,
        maxId,
        postRestriction ? [this._formatPostRestrictionSetting(postRestriction)] : [],
        postRestrictions.praIdxs ? [postRestrictions.praIdxs] : [],
      )
      .accounts({
        postbox: await this.getAddress(),
        poster: this.dispatch.wallet.publicKey!,
        treasury: this.dispatch.addresses.treasuryAddress,
        replyTo: replyTo?.address ?? web3.PublicKey.default,
      })
      .remainingAccounts(postRestrictions.pra)
      .transaction();
    return this.dispatch.sendTransaction(ix);
  }

  async replyToPost(input: InputPostData, replyTo: InteractablePost): Promise<web3.TransactionSignature> {
    return this.createPost(input, replyTo);
  }

  async deletePost(post: InteractablePost): Promise<web3.TransactionSignature> {
    const ix = await this.dispatch.postboxProgram.methods
      .deleteOwnPost(post.postId)
      .accounts({
        postbox: await this.getAddress(),
        post: post.address,
      })
      .transaction();
    return this.dispatch.sendTransaction(ix);
  }

  async deletePostAsModerator(post: InteractablePost): Promise<web3.TransactionSignature> {
    const moderatorMint = await this.getModeratorMint();
    const ata = await splToken.getAssociatedTokenAddress(moderatorMint, this.dispatch.wallet.publicKey!);
    const ix = await this.dispatch.postboxProgram.methods
      .deletePostByModerator(post.postId)
      .accounts({
        postbox: await this.getAddress(),
        post: post.address,
        poster: post.poster,
        moderatorTokenAta: ata,
      })
      .transaction();
    return this.dispatch.sendTransaction(ix);
  }

  async vote(post: InteractablePost, up: boolean): Promise<web3.TransactionSignature> {
    const postRestrictions = await this._getPostRestrictionAccounts(post);
    const ix = await this.dispatch.postboxProgram.methods
      .vote(post.postId, up, postRestrictions.praIdxs ? [postRestrictions.praIdxs] : [])
      .accounts({
        postbox: await this.getAddress(),
        post: post.address,
        treasury: this.dispatch.addresses.treasuryAddress,
      })
      .remainingAccounts(postRestrictions.pra)
      .transaction();
    return this.dispatch.sendTransaction(ix);
  }

  // Fetching functions
  async innerFetchPosts(parent: PostNode, maxChildId: number): Promise<Post[]> {
    if (maxChildId === 0) return [];
    const addresses = await this.getAddresses(maxChildId);
    const chainPosts = (await this.dispatch.postboxProgram.account.post.fetchMultiple(
      addresses,
    )) as NullableChainPost[];
    const convertedPosts = await Promise.all(
      chainPosts.map((rp, i) => {
        return this.convertChainPost(rp, addresses[i], parent, i);
      }),
    );
    return convertedPosts.filter((p): p is Post => p !== null);
  }

  async fetchAllPosts(): Promise<Post[]> {
    const info = await this.getChainPostboxInfo();
    return this.innerFetchPosts(this, info.maxChildId);
  }

  async fetchPosts(): Promise<Post[]> {
    return (await this.fetchAllPosts()).filter((p) => !p.replyTo);
  }

  async fetchReplies(post: InteractablePost): Promise<Post[]> {
    return (await this.fetchAllPosts()).filter((p) => p.replyTo && p.replyTo.equals(post.address));
  }

  // Admin functions
  async addModerator(newModerator: web3.PublicKey): Promise<web3.TransactionSignature> {
    const info = await this.getChainPostboxInfo();
    const ata = await splToken.getAssociatedTokenAddress(info.moderatorMint, newModerator);
    const ix = await this.dispatch.postboxProgram.methods
      .designateModerator(this.target.str ?? '')
      .accounts({
        postbox: await this.getAddress(),
        targetAccount: this.target.key,
        newModerator,
        moderatorAta: ata,
      })
      .transaction();
    return this.dispatch.sendTransaction(ix);
  }

  // Settings functions

  async getOwners(): Promise<web3.PublicKey[]> {
    return (await this.innerGetSetting(SettingsType.ownerInfo))?.ownerInfo?.owners ?? [];
  }

  async setOwners(owners: web3.PublicKey[]): Promise<web3.TransactionSignature> {
    return this.innerSetSetting({ ownerInfo: { owners } });
  }

  async getDescription(): Promise<Description | undefined> {
    return (await this.innerGetSetting(SettingsType.description))?.description;
  }

  async setDescription(description: Description): Promise<web3.TransactionSignature> {
    return this.innerSetSetting({ description });
  }

  async getPostboxPostRestriction(): Promise<PostRestriction | null> {
    const inner = await this.innerGetSetting(SettingsType.postRestrictions);
    const restriction = inner?.postRestriction?.postRestriction ?? null;
    if (restriction?.tokenOwnership) {
      return {
        tokenOwnership: {
          mint: restriction.tokenOwnership.mint,
          amount: (restriction.tokenOwnership.amount as any as anchor.BN).toNumber(),
        },
      };
    }
    return restriction;
  }

  async setPostboxPostRestriction(
    postRestriction: PostRestriction,
    // TODO see if there is a better default than recent
    commitment: web3.Commitment = 'recent',
  ): Promise<web3.TransactionSignature> {
    return this.innerSetSetting(this._formatPostRestrictionSetting(postRestriction), commitment);
  }

  async innerGetSetting(settingsType: SettingsType): Promise<SettingsAccountData | undefined> {
    const info = await this.getChainPostboxInfo();
    for (const setting of info.settings) {
      if (setting[settingsType]) {
        return setting;
      }
    }
    return undefined;
  }

  async innerSetSetting(
    settingsData: any,
    // TODO see if there is a better default than recent
    commitment: web3.Commitment = 'recent',
  ): Promise<web3.TransactionSignature> {
    const ix = await this.dispatch.postboxProgram.methods
      .addOrUpdateSetting(settingsData)
      .accounts({
        postbox: await this.getAddress(),
      })
      .transaction();
    return this.dispatch.sendTransaction(ix, commitment);
  }

  // Role functions
  async isOwner(): Promise<boolean> {
    const owners = await this.getOwners();
    return owners.some((o) => o.equals(this.dispatch.wallet.publicKey!));
  }

  async isModerator(): Promise<boolean> {
    const moderatorMint = await this.getModeratorMint();
    const ata = await splToken.getAssociatedTokenAddress(moderatorMint, this.dispatch.wallet.publicKey!);
    try {
      const tokenAccount = await splToken.getAccount(this.dispatch.conn, ata);
      if (tokenAccount.amount > 0) {
        return true;
      }
    } catch (e) {
      // Fall through to default false return value
    }
    return false;
  }

  async canPost(replyTo?: InteractablePost): Promise<boolean> {
    let restriction: PostRestriction | null = null;

    // Reply-to restrictions override the postbox-wide restrictions
    for (const setting of replyTo?.settings ?? []) {
      if (setting.postRestriction?.postRestriction) {
        restriction = setting.postRestriction.postRestriction;
      }
    }
    if (!restriction) {
      restriction = await this.getPostboxPostRestriction();
    }

    if (!restriction) {
      return true;
    }

    if (restriction.tokenOwnership) {
      const ata = await splToken.getAssociatedTokenAddress(
        restriction.tokenOwnership.mint,
        this.dispatch.wallet.publicKey!,
      );
      const info = await this.dispatch.conn.getAccountInfo(ata);
      const balance = info?.data ? splToken.AccountLayout.decode(info?.data).amount : 0;
      return balance >= restriction.tokenOwnership.amount;
    }

    if (restriction.nftOwnership) {
      const collectionId = restriction.nftOwnership.collectionId;
      const nftsOwned = await getMetadataForOwner(this.dispatch.conn, this.dispatch.wallet.publicKey!);
      const relevantNfts = nftsOwned.filter((nft) => nft.collection?.key.equals(collectionId));
      return relevantNfts.length > 0;
    }

    return false;
  }

  // Chain functions
  async getAddress(): Promise<web3.PublicKey> {
    if (!this._address) {
      const [postAddress] = await web3.PublicKey.findProgramAddress(
        [seeds.protocolSeed, seeds.postboxSeed, this.target.key.toBuffer(), Buffer.from(this.target.str ?? '')],
        this.dispatch.postboxProgram.programId,
      );
      this._address = postAddress;
    }
    return this._address;
  }

  async getPostAddress(postId: number): Promise<web3.PublicKey> {
    const postboxAddress = await this.getAddress();
    const msgCountBuf = Buffer.allocUnsafe(4);
    msgCountBuf.writeInt32LE(postId);
    const [postAddress] = await web3.PublicKey.findProgramAddress(
      [seeds.protocolSeed, seeds.postSeed, postboxAddress.toBuffer(), msgCountBuf],
      this.dispatch.postboxProgram.programId,
    );
    return postAddress;
  }

  async getAddresses(maxPostId: number, startPostId?: number): Promise<web3.PublicKey[]> {
    if ((startPostId ?? 0) > maxPostId) {
      return [];
    }
    const postIds = Array(1 + maxPostId - (startPostId ?? 0))
      .fill(0)
      .map((_element, index) => index);
    const addresses = await Promise.all(postIds.map((id) => this.getPostAddress(id)));
    return addresses;
  }

  async getChainPostboxInfo(): Promise<ChainPostboxInfo> {
    return this.dispatch.postboxProgram.account.postbox.fetch(await this.getAddress());
  }

  async getModeratorMint(): Promise<web3.PublicKey> {
    return (await this.getChainPostboxInfo()).moderatorMint;
  }

  async getModerators(): Promise<web3.PublicKey[]> {
    const infos = await this.dispatch.conn.getProgramAccounts(splToken.TOKEN_PROGRAM_ID, {
      filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: (await this.getModeratorMint()).toBase58() } }],
    });
    return infos.map((ai) => splToken.AccountLayout.decode(ai.account.data).owner);
  }

  // Utility functions
  async convertChainPost(
    chainPost: NullableChainPost,
    address: web3.PublicKey,
    parent: PostNode,
    postId: number,
  ): Promise<Post | null> {
    if (!chainPost) return null;
    const data = await this.bufferToPostData(chainPost.data);
    return {
      parent,
      address,
      postId,
      poster: chainPost.poster,
      data,
      upVotes: chainPost.upVotes,
      downVotes: chainPost.downVotes,
      replyTo: chainPost.replyTo || undefined,
      settings: chainPost.settings,
    };
  }

  async postDataToBuffer(postData: InputPostData): Promise<Buffer> {
    const pd: ChainPostdata = {
      s: postData.subj,
      b: postData.body,
      m: postData.meta,
      t: Math.floor(new Date().getTime() / 1000),
    };
    const dataString = JSON.stringify(pd);
    return Buffer.from(dataString);
  }

  async bufferToPostData(input: Buffer): Promise<PostData> {
    const dataString = input.toString();
    const postData = JSON.parse(dataString) as ChainPostdata;
    return {
      subj: postData.s,
      body: postData.b ?? '',
      ts: new Date((postData.t ?? 0) * 1000),
      meta: postData.m,
    };
  }
}

import * as splToken from '@solana/spl-token';
import * as web3 from '@solana/web3.js';
import { seeds } from './constants';
import { DispatchConnection } from './connection';


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
};

export type InteractablePost = {
  postId: number,
  address: web3.PublicKey,
  poster: web3.PublicKey,
};

type ChainPost = {
  poster: web3.PublicKey;
  data: Buffer;
  upVotes: number;
  downVotes: number;
  replyTo: web3.PublicKey | null;
};

type NullableChainPost = null | ChainPost;

type ChainPostboxInfo = {
  maxChildId: number;
  moderatorMint: web3.PublicKey;
  settingsAccounts: any;
};

export type Description = {
  title: string;
  desc: string;
};

type SettingsAccountData = {
  description?: Description;
  ownerInfo?: {
    owners: web3.PublicKey[];
  }
  postRestrictions?: {};
};

export enum SettingsType {
  ownerInfo = "ownerInfo",
  description = "description",
  postRestrictions = "postRestrictions",
};

export class Postbox {
  private _address: web3.PublicKey | undefined;

  constructor(
    public dispatch: DispatchConnection,
    public target: PostboxTarget,
    ) {}

  // Init functions
  async initialize(owners?: web3.PublicKey[]): Promise<web3.TransactionSignature> {
    const ix = await this.dispatch.postboxProgram.methods
      .initialize(this.target.str ?? "", owners ?? [this.dispatch.wallet.publicKey!])
      .accounts({
        signer: this.dispatch.wallet.publicKey!,
        targetAccount: this.target.key,
        treasury: this.dispatch.addresses.treasuryAddress,
      })
      .transaction();
    return this.dispatch.sendTransaction(ix);
  }

  // Basic commands
  async createPost(input: InputPostData, replyTo?: InteractablePost): Promise<web3.TransactionSignature> {
    // TODO(mfasman): make this be a better allocation algorithm
    const growBy = 1; // TODO(mfasman): pull from the IDL
    const maxId = (await this.getChainPostboxInfo()).maxChildId;
    const addresses = await this.getAddresses(maxId, Math.max(0, maxId - growBy));
    const infos = await this.dispatch.conn.getMultipleAccountsInfo(addresses);
    const data = await this.postDataToBuffer(input);
    const ix = await this.dispatch.postboxProgram.methods
      .createPost(data, maxId)
      .accounts({
        postbox: await this.getAddress(),
        poster: this.dispatch.wallet.publicKey!,
        treasury: this.dispatch.addresses.treasuryAddress,
        replyTo: replyTo?.address ?? web3.PublicKey.default,
      })
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
    const moderatorMint = (await this.getChainPostboxInfo()).moderatorMint;
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

  async vote(post: Post, up: boolean): Promise<web3.TransactionSignature> {
    const ix = await this.dispatch.postboxProgram.methods
      .vote(post.postId, up)
      .accounts({
        postbox: await this.getAddress(),
        post: post.address,
        treasury: this.dispatch.addresses.treasuryAddress,
      })
      .transaction();
    return this.dispatch.sendTransaction(ix);
  }

  // Fetching functions
  async innerFetchPosts(parent: PostNode, maxChildId: number): Promise<Post[]> {
    if (maxChildId === 0) return [];
    const addresses = await this.getAddresses(maxChildId);
    const chainPosts = await this.dispatch.postboxProgram.account.post.fetchMultiple(addresses) as NullableChainPost[];
    const convertedPosts = await Promise.all(chainPosts.map((rp, i) => {
      return this.convertChainPost(rp, addresses[i], parent, i);
    }));
    return convertedPosts.filter((p): p is Post => p !== null);
  }

  async fetchAllPosts(): Promise<Post[]> {
    const info = await this.getChainPostboxInfo();
    return this.innerFetchPosts(this, info.maxChildId);
  }

  async fetchPosts(): Promise<Post[]> {
    return (await this.fetchAllPosts()).filter((p) => !p.replyTo);
  }

  async fetchReplies(post: Post): Promise<Post[]> {
    return (await this.fetchAllPosts()).filter((p) => p.replyTo && p.replyTo.equals(post.address));
  }

  // Admin functions
  async addModerator(newModerator: web3.PublicKey): Promise<web3.TransactionSignature> {
    const info = await this.getChainPostboxInfo();
    const ownerSettings = await this.getSettingsAddress(info, SettingsType.ownerInfo);
    const ata = await splToken.getAssociatedTokenAddress(info.moderatorMint, newModerator);
    const ix = await this.dispatch.postboxProgram.methods
      .designateModerator(this.target.str ?? "")
      .accounts({
        postbox: await this.getAddress(),
        targetAccount: this.target.key,
        newModerator: newModerator,
        ownerSettings,
        moderatorAta: ata,
      })
      .transaction();
    return this.dispatch.sendTransaction(ix);
  }

  // Settings functions

  async getOwners(): Promise<web3.PublicKey[]> {
    const info = await this.getChainPostboxInfo();
    const ownerAddress = await this.getSettingsAddress(info, SettingsType.ownerInfo);
    if (!ownerAddress) return [];
    const ownersAccount = await this.dispatch.postboxProgram.account.settingsAccount.fetch(ownerAddress);
    return (ownersAccount.data as SettingsAccountData).ownerInfo?.owners ?? [];
  }

  async setOwners(owners: web3.PublicKey[]): Promise<web3.TransactionSignature> {
    const settingsType = SettingsType.ownerInfo;
    const settingsData = {ownerInfo : {owners}};
    const settingsSeed = "owners";
    return this.innerSetSetting(settingsType, settingsData, settingsSeed);
  }

  async getDescription(): Promise<Description | undefined> {
    const info = await this.getChainPostboxInfo();
    const descAddress = await this.getSettingsAddress(info, SettingsType.description);
    if (!descAddress) return undefined;
    const descAccount = await this.dispatch.postboxProgram.account.settingsAccount.fetch(descAddress);
    return (descAccount.data as SettingsAccountData).description;
  }

  async setDescription(description: Description): Promise<web3.TransactionSignature> {
    const settingsType = SettingsType.description;
    const settingsData = {description};
    const settingsSeed = "description";
    return this.innerSetSetting(settingsType, settingsData, settingsSeed);
  }

  async innerSetSetting(settingsType: SettingsType, settingsData: any, settingsSeed: string): Promise<web3.TransactionSignature> {
    const info = await this.getChainPostboxInfo();
    const ownerSettings = await this.getSettingsAddress(info, SettingsType.ownerInfo);
    const oldAddress = await this.getSettingsAddress(info, settingsType);
    // This next line looks weird but seems to work
    const settingsEnum = { [settingsType.valueOf()]: {}};
    let ix;
    if (oldAddress) {
      const oldAccount = await this.dispatch.postboxProgram.account.settingsAccount.fetch(oldAddress);
      ix = await this.dispatch.postboxProgram.methods
      .updateSettingsAccount(settingsEnum, settingsData, settingsSeed, oldAccount.version + 1)
      .accounts({
        postbox: await this.getAddress(),
        oldAccount: oldAddress,
        ownerSettings,
      })
      .transaction();
    } else {
      ix = await this.dispatch.postboxProgram.methods
      .addSettingsAccount(settingsEnum, settingsData, settingsSeed)
      .accounts({
        postbox: await this.getAddress(),
        ownerSettings,
      })
      .transaction();
    }
    return this.dispatch.sendTransaction(ix);
  }

  // Chain functions
  async getAddress(): Promise<web3.PublicKey> {
    if (!this._address) {
      const [postAddress] = await web3.PublicKey.findProgramAddress(
        [seeds.protocolSeed, seeds.postboxSeed, this.target.key.toBuffer(), Buffer.from(this.target.str ?? "")],
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

  async convertChainPost(chainPost: NullableChainPost, address: web3.PublicKey, parent: PostNode, postId: number): Promise<Post | null> {
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
    };
  }

  // Utility functions
  async getSettingsAddress(info: ChainPostboxInfo, settingsType: SettingsType): Promise<web3.PublicKey | undefined> {
    for (const setting of info.settingsAccounts as any[]) {
      if (settingsType in setting.settingsType) {
        return setting.address;
      }
    }
    return undefined;
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
      ts: new Date((postData.t?? 0) * 1000),
      meta: postData.m,
    };
  }
}

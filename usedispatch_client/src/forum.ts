import * as web3 from '@solana/web3.js';
import { DispatchConnection } from './connection';
import { TXN_COMMITMENT } from './constants';
import * as postbox from './postbox';

export type ForumInfo = {
  collectionId: web3.PublicKey;
  owners: web3.PublicKey[];
  moderators: web3.PublicKey[];
  title: string;
  description: string;
  postRestriction?: postbox.PostRestriction;
};

export type ForumPost = postbox.Post & {
  forum: Forum;
  isTopic: boolean;
};

export interface IForum {
  // Does the forum exist on chain?
  exists(): Promise<boolean>;

  // Create a postbox for a given collection ID. This might require multiple signatures
  createForum(forum: ForumInfo): Promise<web3.TransactionSignature[]>;

  // Create a postbox for a given collection ID. This might require multiple signatures
  createForumIx(forum: ForumInfo): Promise<web3.Transaction>;

  // Get topics for a forum
  // topics are the same as a post but with topic=true set
  getTopicsForForum(forum: Forum): Promise<ForumPost[]>;

  // Get all posts for a forum
  getPostsForForum(forum: Forum): Promise<ForumPost[]>;

  // For a given topic, the messages
  getTopicMessages(topic: ForumPost): Promise<ForumPost[]>;

  // Create a new topic, optionally overriding the post restrictions on the whole forum
  createTopic(
    forumPost: postbox.InputPostData,
    postRestriction?: postbox.PostRestriction,
  ): Promise<web3.TransactionSignature>;

  // Create a post
  createForumPost(forumPost: postbox.InputPostData, topic: ForumPost): Promise<web3.TransactionSignature>;

  // Delete a post
  deleteForumPost(forumPost: ForumPost): Promise<web3.TransactionSignature>;

  // This is the same as createPost, but additionally,
  // post.parent = postId
  replyToForumPost(replyToPost: ForumPost, post: postbox.InputPostData): Promise<web3.TransactionSignature>;

  // For a given topic, the messages
  getReplies(topic: ForumPost): Promise<ForumPost[]>;

  // Vote a post up
  voteUpForumPost(post: ForumPost): Promise<web3.TransactionSignature>;

  // Vote a post down
  voteDownForumPost(post: ForumPost): Promise<web3.TransactionSignature>;

  // Get a list of the owners of this forum
  getOwners(): Promise<web3.PublicKey[]>;

  // Get the description of the forum: title and blurb
  getDescription(): Promise<postbox.Description | undefined>;

  // Update the description of the forum
  setDescription(desc: postbox.Description): Promise<web3.TransactionSignature>;

  // Get any currently set global post restriction on the forum
  getForumPostRestriction(): Promise<postbox.PostRestriction | null>;

  // Update the pots restrictions on the forum
  setForumPostRestriction(restriction: postbox.PostRestriction): Promise<web3.TransactionSignature>;

  // Delegate the given account as a moderator by giving them a moderator token
  addModerator(newMod: web3.PublicKey): Promise<web3.TransactionSignature>;

  // Delegate the given account as a moderator by giving them a moderator token
  addModeratorIx(newMod: web3.PublicKey): Promise<web3.Transaction>;

  getModeratorMint(): Promise<web3.PublicKey>;

  // Get a list of moderators
  getModerators(): Promise<web3.PublicKey[]>;
}

/**
 * - A forum object is initialized around one postbox
 * - We should cache messages within forums not postboxes
 */
export class Forum implements IForum {
  protected _postbox: postbox.Postbox;

  constructor(public dispatchConn: DispatchConnection, public collectionId: web3.PublicKey) {
    // Create a third party postbox for this forum
    this._postbox = new postbox.Postbox(dispatchConn, {
      key: collectionId,
      str: 'Public',
    });
  }

  async exists(): Promise<boolean> {
    const info = await this._postbox.dispatch.conn.getAccountInfo(await this._postbox.getAddress());
    return info !== null;
  }

  async createForum(info: ForumInfo): Promise<web3.TransactionSignature[]> {
    const forumIx = await this.createForumIx(info);
    const tx = await this.dispatchConn.sendTransaction(forumIx);
    await this._postbox.dispatch.conn.confirmTransaction(tx);
    return [tx];
  }

  async createForumIx(info: ForumInfo): Promise<web3.Transaction> {
    if (!this.collectionId.equals(info.collectionId)) {
      throw new Error('Collection ID must match');
    }
    const desc = {
      title: info.title,
      desc: info.description,
    };
    const ixs = new web3.Transaction();
    ixs.add(await this._postbox.createInitializeIx(info.owners, desc));

    if (info.postRestriction !== undefined) {
      const addRestriction = await this._postbox.setPostboxPostRestrictionIx(info.postRestriction);
      ixs.add(addRestriction);
    }
    await Promise.all(
      info.moderators.map(async (m) => {
        ixs.add(await this.addModeratorIx(m));
      }),
    );
    return ixs;
  }

  async getTopicsForForum(): Promise<ForumPost[]> {
    const topLevelPosts = await this._postbox.fetchPosts();
    const topics = topLevelPosts.filter((p) => p.data.meta?.topic === true);
    return topics.map(this.convertPostboxToForum).sort((a, b) => {
      // Newest topic first
      return -(a.data.ts.getTime() - b.data.ts.getTime());
    });
  }

  async getPostsForForum(): Promise<ForumPost[]> {
    const posts = await this._postbox.fetchAllPosts();
    return posts.map(this.convertPostboxToForum).sort((a, b) => {
      // Newest topic first
      return -(a.data.ts.getTime() - b.data.ts.getTime());
    });
  }

  async getTopicMessages(topic: ForumPost): Promise<ForumPost[]> {
    const messages = await this._postbox.fetchReplies(topic);
    return messages.map(this.convertPostboxToForum).sort((a, b) => {
      // Oldest message first
      return a.data.ts.getTime() - b.data.ts.getTime();
    });
  }

  async createTopic(
    forumPost: postbox.InputPostData,
    postRestriction?: postbox.PostRestriction,
  ): Promise<web3.TransactionSignature> {
    if (!forumPost.meta) {
      forumPost.meta = {};
    }
    forumPost.meta.topic = true;
    return this._postbox.createPost(forumPost, undefined, postRestriction);
  }

  async createForumPost(forumPost: postbox.InputPostData, topic: ForumPost): Promise<web3.TransactionSignature> {
    if (!topic.isTopic) throw new Error('`topic` must have isTopic true');
    return this._postbox.createPost(forumPost, topic);
  }

  async editForumPost(forumPost: ForumPost, newPostData: postbox.InputPostData): Promise<web3.TransactionSignature> {
    if (forumPost.isTopic) {
      if (!newPostData.meta) {
        newPostData.meta = {};
      }
      newPostData.meta.topic = true;
    }
    const pPost = this.convertForumToInteractable(forumPost);
    return this._postbox.editPost(pPost, newPostData);
  }

  async deleteForumPost(forumPost: ForumPost, asModerator?: boolean): Promise<web3.TransactionSignature> {
    const pPost = this.convertForumToInteractable(forumPost);
    if (asModerator) {
      return this._postbox.deletePostAsModerator(pPost);
    }
    return this._postbox.deletePost(pPost);
  }

  async replyToForumPost(replyToPost: ForumPost, post: postbox.InputPostData): Promise<web3.TransactionSignature> {
    return this._postbox.replyToPost(post, replyToPost);
  }

  async getReplies(post: ForumPost): Promise<ForumPost[]> {
    const messages = await this._postbox.fetchReplies(post);
    return messages.map(this.convertPostboxToForum).sort((a, b) => {
      // Oldest message first
      return a.data.ts.getTime() - b.data.ts.getTime();
    });
  }

  async voteUpForumPost(post: ForumPost): Promise<web3.TransactionSignature> {
    return this._postbox.vote(post, true);
  }

  async voteDownForumPost(post: ForumPost): Promise<web3.TransactionSignature> {
    return this._postbox.vote(post, false);
  }

  async addOwners(newOwners: web3.PublicKey[]): Promise<web3.TransactionSignature> {
    const updatedOwners = [...new Set([...(await this.getOwners()), ...newOwners])];
    return this._postbox.setOwners(updatedOwners);
  }

  async getOwners(): Promise<web3.PublicKey[]> {
    return this._postbox.getOwners();
  }

  async getDescription(): Promise<postbox.Description | undefined> {
    return this._postbox.getDescription();
  }

  async setDescription(desc: postbox.Description): Promise<web3.TransactionSignature> {
    return this._postbox.setDescription(desc);
  }

  async getImageUrls(): Promise<postbox.Images | undefined> {
    return this._postbox.getImages();
  }

  async setImageUrls(images: postbox.Images): Promise<web3.TransactionSignature> {
    return this._postbox.setImages(images);
  }

  async getForumPostRestriction(): Promise<postbox.PostRestriction | null> {
    return this._postbox.getPostboxPostRestriction();
  }

  async setForumPostRestriction(
    restriction: postbox.PostRestriction,
    // TODO confirm whether recent is a reasonable default
    commitment: web3.Commitment = TXN_COMMITMENT,
  ): Promise<web3.TransactionSignature> {
    return this._postbox.setPostboxPostRestriction(restriction, commitment);
  }

  async setForumPostRestrictionIx(restriction: postbox.PostRestriction): Promise<web3.Transaction> {
    return this._postbox.setPostboxPostRestrictionIx(restriction);
  }

  async deleteForumPostRestriction(commitment: web3.Commitment = TXN_COMMITMENT): Promise<web3.TransactionSignature> {
    return this._postbox.setPostboxPostRestriction({ null: {} }, commitment);
  }

  async addModerator(newMod: web3.PublicKey): Promise<web3.TransactionSignature> {
    return this._postbox.addModerator(newMod);
  }

  async addModeratorIx(newMod: web3.PublicKey): Promise<web3.Transaction> {
    return this._postbox.createAddModeratorIx(newMod);
  }

  async getModeratorMint(): Promise<web3.PublicKey> {
    return this._postbox.getModeratorMint();
  }

  async getModerators(): Promise<web3.PublicKey[]> {
    return this._postbox.getModerators();
  }

  // Role functions

  async isOwner(): Promise<boolean> {
    return this._postbox.isOwner();
  }

  async isModerator(): Promise<boolean> {
    return this._postbox.isModerator();
  }

  async canCreateTopic(): Promise<boolean> {
    return this._postbox.canPost();
  }

  async canPost(topic: ForumPost): Promise<boolean> {
    return this._postbox.canPost(topic);
  }

  async canVote(post: ForumPost): Promise<boolean> {
    return this._postbox.canPost(post);
  }

  // Helper functions

  protected convertPostboxToForum(p: postbox.Post): ForumPost {
    return {
      ...p,
      forum: this,
      isTopic: (p.data.meta?.topic ?? false) === true,
    };
  }

  protected convertForumToInteractable(p: ForumPost): postbox.InteractablePost {
    return {
      postId: p.postId,
      address: p.address,
      poster: p.poster,
      settings: p.settings,
    };
  }
}

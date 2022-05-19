import * as web3 from '@solana/web3.js';
import { DispatchConnection } from './connection';
import * as postbox from './postbox';

export type ForumInfo = {
  collectionId: web3.PublicKey;
  owners: web3.PublicKey[];
  moderators: web3.PublicKey[];
  title: string;
  description: string;
};

export type ForumPost = postbox.Post & {
  forum: Forum;
  isTopic: boolean;
}

export interface IForum {
  // Does the forum exist on chain?
  exists(): Promise<boolean>;

  // Create a postbox for a given collection ID. This might require multiple signatures
  createForum(forum: ForumInfo): Promise<web3.TransactionSignature[]>;

  // Get topics for a forum
  // topics are the same as a post but with topic=true set
  getTopicsForForum(forum: Forum): Promise<ForumPost[]>;

  // For a given topic, the messages
  getTopicMessages(topic: ForumPost): Promise<ForumPost[]>;

  // Create a new topic
  createTopic(forumPost: postbox.InputPostData): Promise<web3.TransactionSignature>;

  // Create a post
  createForumPost(forumPost: postbox.InputPostData, topic: ForumPost): Promise<web3.TransactionSignature>;

  // Delete a post
  deleteForumPost(forumPost: ForumPost): Promise<web3.TransactionSignature>;

  // This is the same as createPost, but additionally,
  // post.parent = postId
  replyToForumPost(replyToPost: ForumPost, post: postbox.InputPostData): Promise<web3.TransactionSignature>;

  // For a given topic, the messages
  getReplies(topic: ForumPost): Promise<ForumPost[]>;
};

/**
 - A forum object is initialized around one postbox
 - We should cache messages within forums not postboxes
 **/
export class Forum implements IForum {
  protected _postbox: postbox.Postbox;

  constructor(
    public dispatchConn: DispatchConnection,
    public collectionId: web3.PublicKey,
  ) {
    // Create a third party postbox for this forum
    this._postbox = new postbox.Postbox(dispatchConn, {
      key: collectionId,
      str: "Public",
    });
  }

  async exists(): Promise<boolean> {
    const info = await this._postbox.dispatch.conn.getAccountInfo(
      await this._postbox.getAddress());
    return info !== null;
  }

  async createForum(
    info: ForumInfo
  ): Promise<web3.TransactionSignature[]> {
    if (!this.collectionId.equals(info.collectionId)) {
      throw new Error("Collection ID must match");
    }
    const initTx = await this._postbox.initialize(info.owners);
    await this._postbox.dispatch.conn.confirmTransaction(initTx);
    const modTxs = await Promise.all(info.moderators.map((m) => {
      return this._postbox.addModerator(m);
    }));
    // TODO: set the title + description
    return [initTx, ...modTxs];
  }

  async getTopicsForForum(): Promise<ForumPost[]> {
    const topLevelPosts = await this._postbox.fetchPosts();
    const topics = topLevelPosts.filter(
      (p) => p.data.meta?.topic === true
    );
    return topics.map(this.convertPostboxToForum).sort((a, b) => {
      // Newest topic first
      return - (a.data.ts.getTime() - b.data.ts.getTime());
    });
  }

  async getTopicMessages(
    topic: ForumPost
  ): Promise<ForumPost[]> {
    const messages = await this._postbox.fetchReplies(topic);
    return messages.map(this.convertPostboxToForum).sort((a, b) => {
      // Oldest message first
      return a.data.ts.getTime() - b.data.ts.getTime();
    });
  }

  async createTopic(
    forumPost: postbox.InputPostData
  ): Promise<web3.TransactionSignature> {
    if (!forumPost.meta) {
      forumPost.meta = {};
    }
    forumPost.meta.topic = true;
    return this._postbox.createPost(forumPost);
  }

  async createForumPost(
    forumPost: postbox.InputPostData, topic: ForumPost
  ): Promise<web3.TransactionSignature> {
    if (!topic.isTopic) throw new Error("`topic` must have isTopic true");
    return this._postbox.createPost(forumPost, topic);
  }

  async deleteForumPost(
    forumPost: ForumPost,
    asModerator?: boolean,
  ): Promise<web3.TransactionSignature> {
    const pPost = this.convertForumToInteractable(
      forumPost
    );
    if (asModerator) {
      return this._postbox.deletePostAsModerator(
        pPost
      );
    }
    return this._postbox.deletePost(pPost);
  }

  async replyToForumPost(
    replyToPost: ForumPost, post: postbox.InputPostData
  ): Promise<web3.TransactionSignature> {
    return this._postbox.replyToPost(
      post, replyToPost
    );
  }

  async getReplies(
    post: ForumPost
  ): Promise<ForumPost[]> {
    const messages = await this._postbox.fetchReplies(post);
    return messages.map(this.convertPostboxToForum).sort((a, b) => {
      // Oldest message first
      return a.data.ts.getTime() - b.data.ts.getTime();
    });
  }

  // Helper functions

  protected convertPostboxToForum(p: postbox.Post): ForumPost {
    return {
      ...p,
      forum: this,
      isTopic: (p.data.meta?.topic ?? false) === true,
    };
  }

  protected convertForumToInteractable(
    p: ForumPost
  ): postbox.InteractablePost {
    return {
      postId: p.postId,
      address: p.address,
      poster: p.poster,
    };
  }
}
import * as splToken from '@solana/spl-token';
import * as web3 from '@solana/web3.js';
import { seeds } from './constants';
import { WalletInterface } from './wallets';
import { DispatchConnection, DispatchConnectionOpts } from './connection';
import { compress, decompress } from './compress';
import { PostboxSubject } from './postbox';
import * as postbox from './postbox';

// This is taken from the postboxWrapper

// TODO: somehow need to get this from inbox core

export interface Forum {
  postboxId: number;
  collectionId: string;
  owner: string;
  moderators: string; // object
  title: string;
  description: string;
  timestamp: Date;
};


export interface ForumPost {
  postId: number;
  postboxId: number;
  poster: string;
  sub: string;
  body: string;
  meta?: string;
  topic?: boolean;
  parent?: number;
  timestamp: Date;
}

type getTopicDataT = {
  topic: ForumPost,
  posts: ForumPost[]
}

export interface IForum {

  // For a given collection ID, only one postbox can exist
  getForumForCollection?(collectionId: string): Promise<Forum>;

  // Create a postbox for a given collection ID
  createForum?(forum: Forum): Promise<AxiosResponse<any, any>>;

  // Get topics for a forum
  // topics are the same as a post but with topic=true set
  getTopicsForForum?(forum: Forum): Promise<ForumPost[]>;

  // For a given topic ID, get a TopicDataT result
  getTopicData?(topicId: string): Promise<getTopicDataT>;

  // Create a post. This can be used to create a topic as well
  createForumPost?(forumPost: ForumPost): Promise<any>;

  // Delete a post
  deleteForumPost?(forumPost: ForumPost): Promise<any>;

  // This is the same as createPost, but additionally,
  // post.parent = postId
  replyToForumPost?(replyToPost: ForumPost, post: ForumPost): Promise<any>;

};

/**
 - A forum object is initialized around one postbox
 - We should cache messages within forums not postboxes

 **/


export class Forum implements IForum {

  /**
     postboxId: number;
     collectionId: string;
     owner: string;
     moderators: string; // object
     title: string;
     description: string;
     timestamp: Date;
  **/

  private _postbox: postbox.Postbox | undefined;

  constructor(
    public conn: web3.Connection,
    public wallet: WalletInterface,
    public collectionId: string,
    public subject: PostboxSubject,

    // TODO(msfasman): Add description field to postbox
    public description: string
  ) {
    // Create a third party postbox for this forum
    this._postbox = new postbox.Postbox(conn, wallet, {key: subject, str: })
  }

  async initialize() {

  }

  async createForum() {

  }


}

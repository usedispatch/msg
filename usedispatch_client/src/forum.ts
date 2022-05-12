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

  constructor() {
    // Create a third party postbox for this forum
  }

  async initialize() {

  }

  async createForum() {

  }


}

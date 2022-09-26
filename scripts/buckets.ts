export class PostboxV1 {

  private posts: any[];
  private grow_children_by: number;
  public maxId: number;

  constructor() {
    this.maxId = 0;
    this.posts = [];
    this.grow_children_by = 1;
  };

  createPost = (idx: number) => {
    this.posts.push(idx);
    this.maxId += this.grow_children_by;
  }

  fetchPosts = () => {
    return this.posts;
  }

};

export class PostboxV2 {
  // Buckets
  // this approach only needs the storage of bucketMaxPostId[] on chain
  // this will have to maintain
  //   numBuckets instances of k where k <= numPostsPerBucket
  /**
     - we create b buckets of p posts each
     - in the beginning, there are no posts.
     - every create post is done by a user
     - we hash that user into one of the b buckets
     -
   **/

  private posts: number[];
  public maxId: number;
  private numBuckets: number;
  private numPostsPerBucket: number;
  private growPostsBy: number;
  private bucketMaxPostId: number[];

  constructor() {
    this.maxId = 0;
    this.posts = [];
    this.numBuckets = 10;
    this.numPostsPerBucket = 10;
    this.growPostsBy = 1;

    // TODO(viksit): can we store this in a more efficient manner?
    // ideally we don't want to maintain a giant array of numbers and update them
    // in each postbox.
    this.bucketMaxPostId = new Array<number>(this.numBuckets).fill(0);
  };

  getBucketForUser = (userId: number) => {
    return userId % this.numBuckets;
  }

  createPost = (userId: number) => {
    // Find the bucket for this user
    // Find the max child Id for that bucket
    // Increment that by 1
    // Compute the Id of the post by multiplying bucket_idx * new max child Id

    const userBucket = this.getBucketForUser(userId);
    const currentMaxChildInBucket = this.bucketMaxPostId[userBucket];
    const newMaxChildInBucket = currentMaxChildInBucket + this.growPostsBy;
    this.bucketMaxPostId[userBucket] = newMaxChildInBucket;
    const newPostId = (this.numPostsPerBucket * userBucket) + newMaxChildInBucket;
    console.log(`userId: ${userId}, bucket ${userBucket}, current maxpost: ${currentMaxChildInBucket}, new maxpost: ${newMaxChildInBucket}, finalPostId: ${newPostId}`);
    this.posts.push(newPostId);
    return newPostId;
  }

  fetchPosts = () => {
    return this.posts;
  }


};

const runV2 = () => {
  const postbox = new PostboxV2();
  const userIds : number[] = [10,11,12,13,14,15,16,17,18,19,10,11,12];
  for (let userId of userIds) {
    postbox.createPost(userId);
  }
  console.log(postbox);

}

const runV1 = () => {
  const postbox = new PostboxV1();
  for (let i=0; i<10; i++) {
    postbox.createPost(i);
  }
  console.log(`fetch posts: ${postbox.fetchPosts()}`);
  console.log(`max id is now: ${postbox.maxId}`);

}




const main = () => {
  runV2();
}

main();

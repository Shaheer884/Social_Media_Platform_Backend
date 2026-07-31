const Post = require('../../models/Post');
const Comment = require('../../models/Comment');

const getPosts = async (page = 1, limit = 10, search = '', filterHidden = '') => {
  const skip = (page - 1) * limit;
  const query = { isDeleted: false };

  if (search) {
    query.content = { $regex: search, $options: 'i' };
  }
  if (filterHidden === 'true') {
    query.isHidden = true;
  } else if (filterHidden === 'false') {
    query.isHidden = false;
  }

  const posts = await Post.find(query)
    .populate('author', 'username fullName profilePicture email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const postsWithDetails = await Promise.all(
    posts.map(async (post) => {
      const commentCount = await Comment.countDocuments({ post: post._id, isDeleted: false });
      return {
        ...post.toObject(),
        commentCount,
        likesCount: post.likes.length
      };
    })
  );

  const total = await Post.countDocuments(query);
  const pages = Math.ceil(total / limit);

  return {
    posts: postsWithDetails,
    pagination: {
      page,
      limit,
      totalPages: pages,
      totalPosts: total
    }
  };
};

const hidePost = async (id, isHidden) => {
  const post = await Post.findById(id);
  if (!post) throw new Error('Post not found');
  post.isHidden = isHidden;
  await post.save();
  return post;
};

const softDeletePost = async (id) => {
  const post = await Post.findById(id);
  if (!post) throw new Error('Post not found');
  post.isDeleted = true;
  post.deletedAt = new Date();
  await post.save();
  return post;
};

const restorePost = async (id) => {
  const post = await Post.findById(id);
  if (!post) throw new Error('Post not found');
  post.isDeleted = false;
  post.deletedAt = null;
  post.isHidden = false;
  await post.save();
  return post;
};

const permanentDeletePost = async (id) => {
  const post = await Post.findByIdAndDelete(id);
  if (!post) throw new Error('Post not found');
  
  // Clean up post comments
  await Comment.deleteMany({ post: id });
  return post;
};

module.exports = {
  getPosts,
  hidePost,
  softDeletePost,
  restorePost,
  permanentDeletePost
};

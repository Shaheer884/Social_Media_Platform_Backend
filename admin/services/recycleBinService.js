const User = require('../../models/User');
const Post = require('../../models/Post');
const Comment = require('../../models/Comment');

const getDeletedItems = async () => {
  const users = await User.find({ isDeleted: true })
    .select('username fullName email profilePicture deletedAt')
    .sort({ deletedAt: -1 });
    
  const posts = await Post.find({ isDeleted: true })
    .populate('author', 'username fullName profilePicture')
    .sort({ deletedAt: -1 });
    
  const comments = await Comment.find({ isDeleted: true })
    .populate('author', 'username fullName profilePicture')
    .populate('post', 'content')
    .sort({ deletedAt: -1 });
    
  return {
    users,
    posts,
    comments
  };
};

module.exports = {
  getDeletedItems
};

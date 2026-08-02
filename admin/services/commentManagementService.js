const Comment = require('../../models/Comment');

const getComments = async (page = 1, limit = 10, search = '', filterHidden = '') => {
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

  const comments = await Comment.find(query)
    .populate('author', 'username fullName profilePicture email')
    .populate({
      path: 'post',
      select: 'content author media imageUrl mediaType',
      populate: {
        path: 'author',
        select: 'username fullName profilePicture'
      }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Comment.countDocuments(query);
  const pages = Math.ceil(total / limit);

  return {
    comments,
    pagination: {
      page,
      limit,
      totalPages: pages,
      totalComments: total
    }
  };
};

const hideComment = async (id, isHidden) => {
  const comment = await Comment.findById(id);
  if (!comment) throw new Error('Comment not found');
  comment.isHidden = isHidden;
  await comment.save();
  return comment;
};

const softDeleteComment = async (id) => {
  const comment = await Comment.findById(id);
  if (!comment) throw new Error('Comment not found');
  comment.isDeleted = true;
  comment.deletedAt = new Date();
  await comment.save();
  return comment;
};

const restoreComment = async (id) => {
  const comment = await Comment.findById(id);
  if (!comment) throw new Error('Comment not found');
  comment.isDeleted = false;
  comment.deletedAt = null;
  comment.isHidden = false;
  await comment.save();
  return comment;
};

const permanentDeleteComment = async (id) => {
  const result = await Comment.findByIdAndDelete(id);
  if (!result) throw new Error('Comment not found');
  return result;
};

module.exports = {
  getComments,
  hideComment,
  softDeleteComment,
  restoreComment,
  permanentDeleteComment
};

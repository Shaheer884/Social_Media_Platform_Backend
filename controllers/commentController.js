const Comment = require('../models/Comment');
const Post = require('../models/Post');
const Notification = require('../models/Notification');

// @desc    Get comments for a post
// @route   GET /api/posts/:id/comments
// @access  Protected
const getPostComments = async (req, res) => {
  try {
    const comments = await Comment.find({ post: req.params.id })
      .populate('author', 'username fullName profilePicture')
      .sort({ createdAt: 1 }); // Oldest first (chronological order)

    res.json({ success: true, data: comments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Create a comment
// @route   POST /api/posts/:id/comments
// @access  Protected
const createComment = async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Comment content is required' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const newComment = await Comment.create({
      post: req.params.id,
      author: req.user.id,
      content
    });

    const populatedComment = await Comment.findById(newComment._id).populate(
      'author',
      'username fullName profilePicture'
    );

    // Create Notification (only if user comments on someone else's post)
    if (post.author.toString() !== req.user.id) {
      await Notification.create({
        recipient: post.author,
        type: 'comment',
        sender: req.user.id,
        post: post._id
      });
    }

    res.status(201).json({ success: true, data: populatedComment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Delete a comment
// @route   DELETE /api/comments/:id
// @access  Protected
const deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }

    // Check ownership
    if (comment.author.toString() !== req.user.id) {
      return res.status(401).json({ success: false, error: 'Not authorized to delete this comment' });
    }

    await Comment.deleteOne({ _id: comment._id });

    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
  getPostComments,
  createComment,
  deleteComment
};

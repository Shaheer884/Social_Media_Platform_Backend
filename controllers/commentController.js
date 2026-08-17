const Comment = require('../models/Comment');
const Post = require('../models/Post');
const Notification = require('../models/Notification');
const User = require('../models/User');

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

    const author = await User.findById(post.author);
    if (!author) {
      return res.status(404).json({ success: false, error: 'Post author not found' });
    }

    // Check block list
    const isBlockedByAuthor = author.blockedUsers && author.blockedUsers.some(b => b.user.toString() === req.user.id);
    const isBlockedBySelf = req.user.blockedUsers && req.user.blockedUsers.some(b => b.user.toString() === author._id.toString());
    if (isBlockedByAuthor || isBlockedBySelf) {
      return res.status(403).json({ success: false, error: 'Access denied: Blocked user relationship' });
    }

    // Check comment settings
    if (author._id.toString() !== req.user.id) {
      const commentPolicy = (author.commentSettings && author.commentSettings.whoCanComment) || 'Everyone';

      if (commentPolicy === 'Only Me') {
        return res.status(403).json({ success: false, error: 'Only the author can comment on this post.' });
      }

      const isFollowing = author.followers.some(id => id.toString() === req.user.id);

      if (commentPolicy === 'Followers') {
        if (!isFollowing) {
          return res.status(403).json({ success: false, error: 'Only followers of the author can comment on this post.' });
        }
      }

      if (commentPolicy === 'Friends') {
        const isFollowedBy = author.following.some(id => id.toString() === req.user.id);
        const isFriend = isFollowing && isFollowedBy;
        if (!isFriend) {
          return res.status(403).json({ success: false, error: 'Only friends (mutual followers) can comment on this post.' });
        }
      }

      // Check Emoji and GIF blocks (if settings specifically disable them)
      if (author.commentSettings) {
        if (author.commentSettings.allowEmoji === false) {
          // Check for emoji character presence (rough check for common emoji unicode blocks)
          const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
          if (emojiRegex.test(content)) {
            return res.status(400).json({ success: false, error: 'Emojis are not allowed on this post by the author.' });
          }
        }

        if (author.commentSettings.allowGif === false) {
          // Check if it is a gif image link or text containing gif
          if (content.toLowerCase().includes('.gif') || content.toLowerCase().includes('giphy.com') || content.toLowerCase().includes('tenor.com')) {
            return res.status(400).json({ success: false, error: 'GIFs are not allowed on this post by the author.' });
          }
        }
      }
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

    const { handleMentions } = require('../utils/mentionHelper');
    await handleMentions(content, req.user.id, { post: post._id }, 'mentioned you in a comment');

    // Create Notification (only if user comments on someone else's post)
    if (post.author.toString() !== req.user.id) {
      await Notification.create({
        recipient: post.author,
        type: 'comment',
        sender: req.user.id,
        post: post._id,
        comment: newComment._id
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

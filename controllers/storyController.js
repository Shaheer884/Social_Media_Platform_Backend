const Story = require('../models/Story');
const User = require('../models/User');
const Image = require('../models/Image');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

// @desc    Get all active stories (own + followed users) from last 24h
// @route   GET /api/stories
// @access  Protected
const getStories = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const feedUserIds = [...user.following, user._id];
    const activeTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get stories created in the last 24 hours
    const stories = await Story.find({
      user: { $in: feedUserIds },
      createdAt: { $gte: activeTime }
    })
      .populate('user', 'username fullName profilePicture')
      .populate('comments.user', 'username fullName profilePicture')
      .sort({ createdAt: 1 }); // Chronological order

    // Group stories by user
    const grouped = {};
    stories.forEach((story) => {
      if (!story.user) return;
      const userId = story.user._id.toString();
      if (!grouped[userId]) {
        grouped[userId] = {
          user: story.user,
          stories: []
        };
      }
      grouped[userId].stories.push(story);
    });

    const groupedArray = Object.values(grouped);

    // Prioritize current user's stories to be first
    const currentUserStories = groupedArray.find((g) => g.user._id.toString() === req.user.id);
    
    // Sort other users' stories so that the one with the newest story is first (newest activity first)
    const otherUserStories = groupedArray
      .filter((g) => g.user._id.toString() !== req.user.id)
      .sort((a, b) => {
        const timeA = new Date(a.stories[a.stories.length - 1].createdAt).getTime();
        const timeB = new Date(b.stories[b.stories.length - 1].createdAt).getTime();
        return timeB - timeA; // Descending: newest first
      });

    const result = [];
    if (currentUserStories) {
      result.push(currentUserStories);
    }
    result.push(...otherUserStories);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Create a new story
// @route   POST /api/stories
// @access  Protected
const createStory = async (req, res) => {
  try {
    const { text, backgroundColor } = req.body;
    let imageUrl = '';

    // Handle file upload if present
    if (req.file) {
      const newImg = await Image.create({
        data: req.file.buffer,
        contentType: req.file.mimetype,
        size: req.file.size
      });
      imageUrl = `/uploads/${newImg._id}`;
    }

    if (!text && !imageUrl) {
      return res.status(400).json({ success: false, error: 'Story must have either text or an image' });
    }

    const story = await Story.create({
      user: req.user.id,
      text: text || '',
      imageUrl,
      backgroundColor: backgroundColor || 'linear-gradient(135deg, #8b5cf6, #ec4899)'
    });

    const populatedStory = await Story.findById(story._id)
      .populate('user', 'username fullName profilePicture')
      .populate('comments.user', 'username fullName profilePicture');

    res.status(201).json({ success: true, data: populatedStory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Edit a story's text/backgroundColor
// @route   PUT /api/stories/:id
// @access  Protected
const updateStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    // Owner check
    if (story.user.toString() !== req.user.id) {
      return res.status(401).json({ success: false, error: 'Not authorized to edit this story' });
    }

    const { text, backgroundColor } = req.body;
    story.text = text !== undefined ? text : story.text;
    story.backgroundColor = backgroundColor !== undefined ? backgroundColor : story.backgroundColor;

    await story.save();
    const populated = await Story.findById(story._id).populate('user', 'username fullName profilePicture');

    res.json({ success: true, data: populated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Delete a story
// @route   DELETE /api/stories/:id
// @access  Protected
const deleteStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    // Owner check
    if (story.user.toString() !== req.user.id) {
      return res.status(401).json({ success: false, error: 'Not authorized to delete this story' });
    }

    // Delete associated image if it's a database upload
    if (story.imageUrl && story.imageUrl.startsWith('/uploads/')) {
      const imageId = story.imageUrl.split('/').pop();
      if (mongoose.Types.ObjectId.isValid(imageId)) {
        await Image.deleteOne({ _id: imageId });
      }
    }

    await Story.deleteOne({ _id: req.params.id });

    res.json({ success: true, message: 'Story deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Like a story
// @route   POST /api/stories/:id/like
// @access  Protected
const likeStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);

    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    if (story.likes.includes(req.user.id)) {
      return res.status(400).json({ success: false, error: 'Story already liked' });
    }

    story.likes.push(req.user.id);
    await story.save();

    // Create Notification (only if user likes someone else's story)
    if (story.user.toString() !== req.user.id) {
      await Notification.create({
        recipient: story.user,
        type: 'story-like',
        sender: req.user.id,
        story: story._id
      });
    }

    res.json({ success: true, message: 'Story liked successfully', likes: story.likes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Unlike a story
// @route   DELETE /api/stories/:id/like
// @access  Protected
const unlikeStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);

    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    if (!story.likes.includes(req.user.id)) {
      return res.status(400).json({ success: false, error: 'Story has not been liked' });
    }

    story.likes = story.likes.filter((userId) => userId.toString() !== req.user.id);
    await story.save();

    // Delete matching Notification if any
    if (story.user.toString() !== req.user.id) {
      await Notification.deleteOne({
        recipient: story.user,
        type: 'story-like',
        sender: req.user.id,
        story: story._id
      });
    }

    res.json({ success: true, message: 'Story unliked successfully', likes: story.likes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Comment on a story
// @route   POST /api/stories/:id/comment
// @access  Protected
const commentStory = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Comment text is required' });
    }

    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    const comment = {
      user: req.user.id,
      text: text.trim()
    };

    story.comments.push(comment);
    await story.save();

    const populatedStory = await Story.findById(story._id)
      .populate('user', 'username fullName profilePicture')
      .populate('comments.user', 'username fullName profilePicture');

    // Get the newly added comment with populated user
    const addedComment = populatedStory.comments[populatedStory.comments.length - 1];

    // Create Notification (only if user comments on someone else's story)
    if (story.user.toString() !== req.user.id) {
      await Notification.create({
        recipient: story.user,
        type: 'story-comment',
        sender: req.user.id,
        story: story._id
      });
    }

    res.json({ success: true, comment: addedComment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
  getStories,
  createStory,
  updateStory,
  deleteStory,
  likeStory,
  unlikeStory,
  commentStory
};

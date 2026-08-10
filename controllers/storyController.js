const Story = require('../models/Story');
const User = require('../models/User');
const Image = require('../models/Image');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const { cloudinary, uploadStream } = require('../config/cloudinary');

const parseField = (field) => {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  try {
    return JSON.parse(field);
  } catch (e) {
    return typeof field === 'string' ? field.split(',').map(s => s.trim()).filter(Boolean) : [];
  }
};

const checkStoryAccess = async (story, viewerId) => {
  const ownerId = story.user._id || story.user;
  if (ownerId.toString() === viewerId.toString()) {
    return true;
  }

  // Check expiration (24 hours)
  const activeTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (story.createdAt < activeTime) {
    return false;
  }

  // Check if explicitly mentioned
  const mentions = story.mentions || [];
  if (mentions.some(id => id.toString() === viewerId.toString())) {
    return true;
  }

  // Check privacy settings
  const privacy = story.privacy || 'public';
  if (privacy === 'me') {
    return false;
  }
  if (privacy === 'custom') {
    const allowed = story.allowedUsers || [];
    return allowed.some(id => id.toString() === viewerId.toString());
  }
  if (privacy === 'hide') {
    const hidden = story.hiddenUsers || [];
    return !hidden.some(id => id.toString() === viewerId.toString());
  }

  // Retrieve user followers/following if not populated
  let userDoc = story.user;
  if (!userDoc.followers || !userDoc.following) {
    userDoc = await User.findById(story.user).select('followers following');
    if (!userDoc) return false;
  }

  const authorFollowers = userDoc.followers || [];
  const authorFollowing = userDoc.following || [];
  
  if (privacy === 'followers') {
    return authorFollowers.some(id => id.toString() === viewerId.toString());
  }
  if (privacy === 'friends') {
    const isFollower = authorFollowers.some(id => id.toString() === viewerId.toString());
    const isFollowing = authorFollowing.some(id => id.toString() === viewerId.toString());
    return isFollower && isFollowing;
  }

  return true;
};

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

    // Find all users in feedUserIds who are private (isPrivate: true) and NOT the current user
    const privateUsers = await User.find({
      _id: { $in: feedUserIds, $ne: req.user.id },
      isPrivate: true
    }).select('_id');
    const privateUserIds = privateUsers.map(u => u._id.toString());

    // Filter feedUserIds to exclude private users
    const filteredFeedUserIds = feedUserIds.filter(id => !privateUserIds.includes(id.toString()));

    // Get stories created in the last 24 hours
    const stories = await Story.find({
      user: { $in: filteredFeedUserIds },
      createdAt: { $gte: activeTime }
    })
      .populate('user', 'username fullName profilePicture followers following')
      .populate('comments.user', 'username fullName profilePicture')
      .sort({ createdAt: 1 }); // Chronological order

    // Filter stories based on privacy rules
    const visibleStories = [];
    for (const story of stories) {
      const isVisible = await checkStoryAccess(story, req.user.id);
      if (isVisible) {
        visibleStories.push(story);
      }
    }

    // Group stories by user
    const grouped = {};
    visibleStories.forEach((story) => {
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
    const { text, backgroundColor, privacy, allowedUsers, hiddenUsers, mentions } = req.body;
    let imageUrl = '';
    let mediaType = 'image';
    let cloudinaryPublicId = '';
    const media = [];

    // Handle file upload if present
    if (req.file) {
      const { getSettings } = require('../admin/utils/settingsHelper');
      const settings = await getSettings();

      const isVideo = req.file.mimetype.startsWith('video/');
      const isImage = req.file.mimetype.startsWith('image/');

      if (isImage && !settings.allowedImageTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: `Unsupported image type: ${req.file.mimetype}. Supported image types: ${settings.allowedImageTypes.join(', ')}`
        });
      }

      if (isVideo && !settings.allowedVideoTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: `Unsupported video type: ${req.file.mimetype}. Supported video types: ${settings.allowedVideoTypes.join(', ')}`
        });
      }

      if (!isVideo && !isImage) {
        return res.status(400).json({
          success: false,
          error: `Unsupported file type: ${req.file.originalname}. Only images and videos are supported.`
        });
      }

      if (isImage && req.file.size > settings.maxImageSize) {
        return res.status(400).json({
          success: false,
          error: `Image ${req.file.originalname} exceeds the size limit of ${settings.maxImageSize / (1024 * 1024)}MB.`
        });
      }

      if (isVideo && req.file.size > settings.maxVideoSize) {
        return res.status(400).json({
          success: false,
          error: `Video ${req.file.originalname} exceeds the size limit of ${settings.maxVideoSize / (1024 * 1024)}MB.`
        });
      }

      const resourceType = isVideo ? 'video' : 'image';
      const folder = isVideo ? 'connecthub/stories/videos' : 'connecthub/stories/images';

      const result = await uploadStream(req.file.buffer, folder, resourceType);

      imageUrl = result.secure_url;
      mediaType = result.resource_type || resourceType;
      cloudinaryPublicId = result.public_id;

      media.push({
        url: result.secure_url,
        publicId: result.public_id,
        resourceType: result.resource_type || resourceType,
        format: result.format,
        width: result.width,
        height: result.height,
        duration: result.duration || 0,
        size: result.bytes
      });
    }

    if (!text && !imageUrl) {
      return res.status(400).json({ success: false, error: 'Story must have either text or an image/video' });
    }

    // Parse text mentions to extract user IDs
    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    const matches = [...(text || '').matchAll(mentionRegex)];
    const usernames = [...new Set(matches.map(m => m[1]))];
    const mentionUserIds = [];
    if (usernames.length > 0) {
      const users = await User.find({ username: { $in: usernames } }).select('_id');
      users.forEach(u => mentionUserIds.push(u._id));
    }

    const explicitMentions = parseField(mentions);
    const combinedMentions = [...new Set([...explicitMentions, ...mentionUserIds.map(id => id.toString())])];

    const story = await Story.create({
      user: req.user.id,
      text: text || '',
      imageUrl,
      mediaType,
      cloudinaryPublicId,
      media,
      backgroundColor: backgroundColor || 'linear-gradient(135deg, #8b5cf6, #ec4899)',
      privacy: privacy || 'public',
      allowedUsers: parseField(allowedUsers),
      hiddenUsers: parseField(hiddenUsers),
      mentions: combinedMentions
    });

    const populatedStory = await Story.findById(story._id)
      .populate('user', 'username fullName profilePicture')
      .populate('comments.user', 'username fullName profilePicture');

    // Create notifications for mentioned users
    for (const mentionedId of combinedMentions) {
      if (mentionedId.toString() === req.user.id) continue;
      
      const existingNoti = await Notification.findOne({
        recipient: mentionedId,
        sender: req.user.id,
        type: 'story-mention',
        story: story._id
      });
      if (!existingNoti) {
        await Notification.create({
          recipient: mentionedId,
          sender: req.user.id,
          type: 'story-mention',
          story: story._id
        });
      }
    }

    const { handleMentions } = require('../utils/mentionHelper');
    await handleMentions(text, req.user.id, { story: story._id }, 'mentioned you in a story');

    res.status(201).json({ success: true, data: populatedStory });
  } catch (error) {
    console.error('Error creating story:', error);
    res.status(500).json({ success: false, error: 'Server error creating story' });
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

    const { text, backgroundColor, privacy, allowedUsers, hiddenUsers, mentions } = req.body;
    story.text = text !== undefined ? text : story.text;
    story.backgroundColor = backgroundColor !== undefined ? backgroundColor : story.backgroundColor;
    if (privacy !== undefined) story.privacy = privacy;
    if (allowedUsers !== undefined) story.allowedUsers = parseField(allowedUsers);
    if (hiddenUsers !== undefined) story.hiddenUsers = parseField(hiddenUsers);

    // Handle mentions updating
    if (text !== undefined || mentions !== undefined) {
      const mentionRegex = /@([a-zA-Z0-9_]+)/g;
      const matches = [...(story.text || '').matchAll(mentionRegex)];
      const usernames = [...new Set(matches.map(m => m[1]))];
      const mentionUserIds = [];
      if (usernames.length > 0) {
        const users = await User.find({ username: { $in: usernames } }).select('_id');
        users.forEach(u => mentionUserIds.push(u._id));
      }
      
      const explicitMentions = mentions !== undefined ? parseField(mentions) : (story.mentions || []);
      const combinedMentions = [...new Set([...explicitMentions.map(id => id.toString()), ...mentionUserIds.map(id => id.toString())])];
      story.mentions = combinedMentions;

      // Send notifications
      for (const mentionedId of combinedMentions) {
        if (mentionedId.toString() === req.user.id) continue;
        const existingNoti = await Notification.findOne({
          recipient: mentionedId,
          sender: req.user.id,
          type: 'story-mention',
          story: story._id
        });
        if (!existingNoti) {
          await Notification.create({
            recipient: mentionedId,
            sender: req.user.id,
            type: 'story-mention',
            story: story._id
          });
        }
      }
    }

    await story.save();
    const populated = await Story.findById(story._id).populate('user', 'username fullName profilePicture');

    const { handleMentions } = require('../utils/mentionHelper');
    await handleMentions(text, req.user.id, { story: story._id }, 'mentioned you in a story');

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

    // Delete associated media from Cloudinary
    if (story.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(story.cloudinaryPublicId, { resource_type: story.mediaType || 'image' });
      } catch (err) {
        console.error('Failed to delete Cloudinary asset of story:', err);
      }
    } else if (story.media && story.media.length > 0) {
      for (const m of story.media) {
        if (m.publicId) {
          try {
            await cloudinary.uploader.destroy(m.publicId, { resource_type: m.resourceType || 'image' });
          } catch (err) {
            console.error('Failed to delete Cloudinary asset of story in media array:', err);
          }
        }
      }
    }

    await Story.deleteOne({ _id: req.params.id });

    res.json({ success: true, message: 'Story deleted successfully' });
  } catch (error) {
    console.error('Error deleting story:', error);
    res.status(500).json({ success: false, error: 'Server error deleting story' });
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

// @desc    Record story view
// @route   POST /api/stories/:id/view
// @access  Protected
const viewStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    const hasAccess = await checkStoryAccess(story, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this story' });
    }

    if (story.user.toString() !== req.user.id) {
      const alreadyViewed = story.views && story.views.some(v => v.user.toString() === req.user.id);
      if (!alreadyViewed) {
        if (!story.views) story.views = [];
        story.views.push({
          user: req.user.id,
          viewedAt: new Date()
        });
        await story.save();
      }
    }

    res.json({ success: true, message: 'Story view recorded' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get story viewers
// @route   GET /api/stories/:id/views
// @access  Protected
const getStoryViews = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id)
      .populate('views.user', 'username fullName profilePicture');
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    if (story.user.toString() !== req.user.id) {
      return res.status(401).json({ success: false, error: 'Not authorized to see views list' });
    }

    res.json({
      success: true,
      count: story.views.length,
      views: story.views
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get story likes
// @route   GET /api/stories/:id/likes
// @access  Protected
const getStoryLikes = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id)
      .populate('likes', 'username fullName profilePicture');
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    const hasAccess = await checkStoryAccess(story, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Not authorized to access this story' });
    }

    res.json({
      success: true,
      count: story.likes.length,
      likes: story.likes
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Reply to story
// @route   POST /api/stories/:id/reply
// @access  Protected
const replyStory = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Reply message is required' });
    }

    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    const hasAccess = await checkStoryAccess(story, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Not authorized to reply to this story' });
    }

    const reply = {
      sender: req.user.id,
      receiver: story.user,
      message: message.trim(),
      createdAt: new Date()
    };

    if (!story.storyReplies) story.storyReplies = [];
    story.storyReplies.push(reply);
    await story.save();

    // Create Notification
    if (story.user.toString() !== req.user.id) {
      await Notification.create({
        recipient: story.user,
        type: 'story-reply',
        sender: req.user.id,
        story: story._id,
        message: message.trim()
      });
    }

    res.status(201).json({ success: true, reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get story replies
// @route   GET /api/stories/:id/replies
// @access  Protected
const getStoryReplies = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id)
      .populate('storyReplies.sender', 'username fullName profilePicture')
      .populate('storyReplies.receiver', 'username fullName profilePicture');
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    const isOwner = story.user.toString() === req.user.id;
    let replies = story.storyReplies || [];
    if (!isOwner) {
      replies = replies.filter(r => r.sender._id.toString() === req.user.id);
    }

    res.json({
      success: true,
      data: replies
    });
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
  commentStory,
  viewStory,
  getStoryViews,
  getStoryLikes,
  replyStory,
  getStoryReplies
};

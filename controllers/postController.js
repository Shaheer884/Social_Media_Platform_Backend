const Post = require('../models/Post');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Comment = require('../models/Comment');
const mongoose = require('mongoose');
const Image = require('../models/Image');
const { cloudinary, uploadStream } = require('../config/cloudinary');

// @desc    Get post feed (followed users + own posts)
// @route   GET /api/posts
// @access  Protected
const getPostFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get current user details and their saved posts list
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const savedPostIds = (user.savedPosts || []).map((id) => id.toString());

    // Feed includes followed users' posts + own posts
    const feedUserIds = [...user.following, user._id];

    // Find blocked users and users who blocked me
    const blockedUserIds = (user.blockedUsers || []).map(b => b.user.toString());
    const usersWhoBlockedMe = await User.find({ 'blockedUsers.user': req.user.id }).select('_id');
    const usersWhoBlockedMeIds = usersWhoBlockedMe.map(u => u._id.toString());
    const allExcludedUserIds = [...blockedUserIds, ...usersWhoBlockedMeIds];

    // Filter feedUserIds to exclude blocked accounts
    const filteredFeedUserIds = feedUserIds.filter(id => !allExcludedUserIds.includes(id.toString()));

    // Fetch friends list of current user to filter posts with 'Friends' audience
    const friendUsers = await User.find({
      _id: { $in: user.following },
      following: req.user.id
    }).select('_id');
    const friendIds = friendUsers.map(u => u._id.toString());

    // Build feed query with audience permissions
    const feedQuery = {
      author: { $in: filteredFeedUserIds },
      isDeleted: false,
      isHidden: false,
      isArchived: { $ne: true },
      $or: [
        { author: req.user.id },
        {
          author: { $ne: req.user.id },
          $or: [
            { audience: { $in: ['Public', null, undefined] } },
            { audience: 'Friends', author: { $in: friendIds } }
          ]
        }
      ]
    };

    // Find posts, populate author details, order by createdAt desc
    const posts = await Post.find(feedQuery)
      .populate('author', 'username fullName profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPosts = await Post.countDocuments(feedQuery);
    const totalPages = Math.ceil(totalPosts / limit);

    // Get comment count for each post
    const postsWithDetails = await Promise.all(
      posts.map(async (post) => {
        const commentCount = await Comment.countDocuments({ post: post._id });
        return {
          ...post._doc,
          commentCount,
          likesCount: post.likes.length,
          isLiked: post.likes.includes(req.user.id),
          isSaved: savedPostIds.includes(post._id.toString())
        };
      })
    );

    res.json({
      success: true,
      pagination: {
        page,
        limit,
        totalPages,
        totalPosts
      },
      data: postsWithDetails
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Create a new post
// @route   POST /api/posts
// @access  Protected
const createPost = async (req, res) => {
  let media = [];
  try {
    const { content, imageUrlUrl, feeling, activity, bgColor, audience } = req.body;

    media = req.body.media || [];
    if (typeof media === 'string') {
      try {
        media = JSON.parse(media);
      } catch (err) {
        media = [];
      }
    }

    if (!content && media.length === 0 && !imageUrlUrl) {
      return res.status(400).json({ success: false, error: 'Post must contain content or media' });
    }

    // Centralized backend metadata validation
    if (media.length > 0) {
      if (media.length > 10) {
        for (const m of media) {
          if (m.publicId && !m.publicId.startsWith('external_url_')) {
            await cloudinary.uploader.destroy(m.publicId, { resource_type: m.resourceType || 'image' }).catch(() => {});
          }
        }
        return res.status(400).json({ success: false, error: 'Maximum post media limit is 10 items.' });
      }

      for (const m of media) {
        const isVideo = m.resourceType === 'video';
        const isImage = m.resourceType === 'image';

        if (!isImage && !isVideo) {
          for (const item of media) {
            if (item.publicId && !item.publicId.startsWith('external_url_')) {
              await cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType || 'image' }).catch(() => {});
            }
          }
          return res.status(400).json({ success: false, error: 'Unsupported media type.' });
        }

        const formatLower = (m.format || '').toLowerCase();
        if (isImage) {
          const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
          if (m.format && !allowedFormats.includes(formatLower)) {
            for (const item of media) {
              if (item.publicId && !item.publicId.startsWith('external_url_')) {
                await cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType || 'image' }).catch(() => {});
              }
            }
            return res.status(400).json({ success: false, error: `Unsupported image format: ${m.format}.` });
          }
          if (m.size > 10 * 1024 * 1024) {
            for (const item of media) {
              if (item.publicId && !item.publicId.startsWith('external_url_')) {
                await cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType || 'image' }).catch(() => {});
              }
            }
            return res.status(400).json({ success: false, error: 'Image exceeds the 10MB size limit.' });
          }
        }

        if (isVideo) {
          const allowedFormats = ['mp4', 'mov', 'quicktime', 'webm'];
          if (m.format && !allowedFormats.includes(formatLower)) {
            for (const item of media) {
              if (item.publicId && !item.publicId.startsWith('external_url_')) {
                await cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType || 'image' }).catch(() => {});
              }
            }
            return res.status(400).json({ success: false, error: `Unsupported video format: ${m.format}.` });
          }
          if (m.size > 30 * 1024 * 1024) {
            for (const item of media) {
              if (item.publicId && !item.publicId.startsWith('external_url_')) {
                await cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType || 'image' }).catch(() => {});
              }
            }
            return res.status(400).json({ success: false, error: 'Video exceeds the 30MB size limit.' });
          }
          if (m.duration > 300) {
            for (const item of media) {
              if (item.publicId && !item.publicId.startsWith('external_url_')) {
                await cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType || 'image' }).catch(() => {});
              }
            }
            return res.status(400).json({ success: false, error: 'Video duration exceeds the 5 minutes limit.' });
          }
        }
      }
    } else if (imageUrlUrl) {
      let formattedUrl = imageUrlUrl.trim();
      if (formattedUrl && !/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith('/')) {
        formattedUrl = 'https://' + formattedUrl;
      }
      media.push({
        url: formattedUrl,
        publicId: 'external_url_' + Date.now(),
        resourceType: 'image',
        format: 'external',
        width: 0,
        height: 0,
        duration: 0,
        size: 0
      });
    }

    // Set legacy fields for backward compatibility
    let imageUrl = '';
    let mediaUrl = '';
    let mediaType = 'none';
    let cloudinaryPublicId = '';

    if (media.length > 0) {
      imageUrl = media[0].url;
      mediaUrl = media[0].url;
      mediaType = media[0].resourceType;
      cloudinaryPublicId = media[0].publicId;
    }

    let locationData = undefined;
    if (req.body.location) {
      try {
        locationData = typeof req.body.location === 'string' ? JSON.parse(req.body.location) : req.body.location;
      } catch (err) {
        console.error('Failed to parse location in createPost:', err);
      }
    }

    const newPost = await Post.create({
      author: req.user.id,
      content,
      imageUrl,
      mediaUrl,
      mediaType,
      cloudinaryPublicId,
      media,
      location: locationData,
      feeling,
      activity,
      bgColor,
      audience
    });

    const populatedPost = await Post.findById(newPost._id).populate(
      'author',
      'username fullName profilePicture'
    );

    const { handleMentions } = require('../utils/mentionHelper');
    await handleMentions(content, req.user.id, { post: newPost._id }, 'mentioned you in a post');

    res.status(201).json({
      success: true,
      data: {
        ...populatedPost._doc,
        commentCount: 0,
        likesCount: 0,
        isLiked: false,
        isSaved: false
      }
    });
  } catch (error) {
    // Failed upload cleanup to prevent orphan resources
    if (media && media.length > 0) {
      for (const m of media) {
        if (m.publicId && !m.publicId.startsWith('external_url_')) {
          await cloudinary.uploader.destroy(m.publicId, { resource_type: m.resourceType || 'image' }).catch(() => {});
        }
      }
    }
    console.error('Error creating post:', error);
    res.status(500).json({ success: false, error: 'Server error creating post' });
  }
};

// @desc    Get a single post details
// @route   GET /api/posts/:id
// @access  Protected
const getPostById = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'username fullName profilePicture')
      .populate('likes', 'username fullName profilePicture followers following');

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Check block list
    const postAuthor = await User.findById(post.author._id);
    if (postAuthor) {
      const isBlockedByAuthor = postAuthor.blockedUsers && postAuthor.blockedUsers.some(b => b.user.toString() === req.user.id);
      const isBlockedBySelf = req.user.blockedUsers && req.user.blockedUsers.some(b => b.user.toString() === postAuthor._id.toString());
      if (isBlockedByAuthor || isBlockedBySelf) {
        return res.status(403).json({ success: false, error: 'Access denied: Blocked user relationship' });
      }
    }

    // Check post audience permissions
    const isAuthor = post.author._id.toString() === req.user.id;
    if (post.audience === 'Only me' && !isAuthor) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this post' });
    }

    if (post.audience === 'Friends' && !isAuthor) {
      const authorUser = await User.findById(post.author._id);
      const isFollowing = authorUser.followers.some(id => id.toString() === req.user.id);
      const isFollowedBy = authorUser.following.some(id => id.toString() === req.user.id);
      const isFriend = isFollowing && isFollowedBy;
      if (!isFriend) {
        return res.status(403).json({ success: false, error: 'Not authorized to view this post. Only friends can view this.' });
      }
    }

    const commentCount = await Comment.countDocuments({ post: post._id });

    const likesWithStatus = post.likes.map(u => {
      const isFollowing = u.followers.some(id => id.toString() === req.user.id);
      const isFollowedBy = u.following.some(id => id.toString() === req.user.id);
      
      let relationshipStatus = 'follow';
      if (isFollowing && isFollowedBy) {
        relationshipStatus = 'friends';
      } else if (isFollowing) {
        relationshipStatus = 'following';
      } else if (isFollowedBy) {
        relationshipStatus = 'follow_back';
      }

      return {
        _id: u._id,
        username: u.username,
        fullName: u.fullName,
        profilePicture: u.profilePicture,
        relationshipStatus
      };
    });

    const user = await User.findById(req.user.id);
    const isSaved = user && user.savedPosts ? user.savedPosts.includes(post._id) : false;

    res.json({
      success: true,
      data: {
        ...post._doc,
        commentCount,
        likesCount: post.likes.length,
        likes: likesWithStatus,
        isLiked: post.likes.some((likeUser) => likeUser._id.toString() === req.user.id),
        isSaved
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Update user post
// @route   PUT /api/posts/:id
// @access  Protected
const updatePost = async (req, res) => {
  let newMedia = [];
  try {
    let post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Check post ownership
    if (post.author.toString() !== req.user.id) {
      return res.status(401).json({ success: false, error: 'Not authorized to edit this post' });
    }

    const { content, imageUrlUrl, isHidden, isArchived } = req.body;
    post.content = content !== undefined ? content : post.content;
    if (req.body.bgColor !== undefined) {
      post.bgColor = req.body.bgColor;
    }
    if (isHidden !== undefined) {
      post.isHidden = isHidden === 'true' || isHidden === true;
    }
    if (isArchived !== undefined) {
      post.isArchived = isArchived === 'true' || isArchived === true;
    }

    // 1. Determine remaining media
    let remainingMedia = [];
    if (req.body.existingMedia) {
      try {
        remainingMedia = typeof req.body.existingMedia === 'string'
          ? JSON.parse(req.body.existingMedia)
          : req.body.existingMedia;
      } catch (err) {
        remainingMedia = [];
      }
    } else {
      remainingMedia = post.media || [];
    }

    // 2. Identify removed media and delete from Cloudinary
    const remainingPublicIds = remainingMedia.map((m) => m.publicId);
    const removedMedia = (post.media || []).filter((m) => !remainingPublicIds.includes(m.publicId));

    for (const m of removedMedia) {
      if (m.publicId && !m.publicId.startsWith('external_url_')) {
        try {
          await cloudinary.uploader.destroy(m.publicId, { resource_type: m.resourceType || 'image' });
        } catch (err) {
          console.error('Failed to delete Cloudinary media during edit:', err);
        }
      }
    }

    // 3. Parse and validate new media if sent by client
    newMedia = req.body.newMedia || [];
    if (typeof newMedia === 'string') {
      try {
        newMedia = JSON.parse(newMedia);
      } catch (err) {
        newMedia = [];
      }
    }

    if (newMedia.length > 0) {
      // Validate new files
      for (const m of newMedia) {
        const isVideo = m.resourceType === 'video';
        const isImage = m.resourceType === 'image';

        if (!isImage && !isVideo) {
          for (const item of newMedia) {
            if (item.publicId && !item.publicId.startsWith('external_url_')) {
              await cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType || 'image' }).catch(() => {});
            }
          }
          return res.status(400).json({ success: false, error: 'Unsupported media type.' });
        }

        const formatLower = (m.format || '').toLowerCase();
        if (isImage) {
          const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
          if (m.format && !allowedFormats.includes(formatLower)) {
            for (const item of newMedia) {
              if (item.publicId && !item.publicId.startsWith('external_url_')) {
                await cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType || 'image' }).catch(() => {});
              }
            }
            return res.status(400).json({ success: false, error: `Unsupported image format: ${m.format}.` });
          }
          if (m.size > 10 * 1024 * 1024) {
            for (const item of newMedia) {
              if (item.publicId && !item.publicId.startsWith('external_url_')) {
                await cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType || 'image' }).catch(() => {});
              }
            }
            return res.status(400).json({ success: false, error: 'Image exceeds the 10MB size limit.' });
          }
        }

        if (isVideo) {
          const allowedFormats = ['mp4', 'mov', 'quicktime', 'webm'];
          if (m.format && !allowedFormats.includes(formatLower)) {
            for (const item of newMedia) {
              if (item.publicId && !item.publicId.startsWith('external_url_')) {
                await cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType || 'image' }).catch(() => {});
              }
            }
            return res.status(400).json({ success: false, error: `Unsupported video format: ${m.format}.` });
          }
          if (m.size > 30 * 1024 * 1024) {
            for (const item of newMedia) {
              if (item.publicId && !item.publicId.startsWith('external_url_')) {
                await cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType || 'image' }).catch(() => {});
              }
            }
            return res.status(400).json({ success: false, error: 'Video exceeds the 30MB size limit.' });
          }
          if (m.duration > 300) {
            for (const item of newMedia) {
              if (item.publicId && !item.publicId.startsWith('external_url_')) {
                await cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType || 'image' }).catch(() => {});
              }
            }
            return res.status(400).json({ success: false, error: 'Video duration exceeds the 5 minutes limit.' });
          }
        }
      }
    } else if (imageUrlUrl) {
      // If client sent imageUrlUrl and we didn't have it before
      const hasUrl = remainingMedia.some(m => m.url === imageUrlUrl.trim());
      if (!hasUrl) {
        let formattedUrl = imageUrlUrl.trim();
        if (formattedUrl && !/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith('/')) {
          formattedUrl = 'https://' + formattedUrl;
        }
        newMedia.push({
          url: formattedUrl,
          publicId: 'external_url_' + Date.now(),
          resourceType: 'image',
          format: 'external',
          width: 0,
          height: 0,
          duration: 0,
          size: 0
        });
      }
    }

    // Combine remaining and new media
    post.media = [...remainingMedia, ...newMedia];

    // Update legacy fields for backward compatibility
    if (post.media.length > 0) {
      post.imageUrl = post.media[0].url;
      post.mediaUrl = post.media[0].url;
      post.mediaType = post.media[0].resourceType;
      post.cloudinaryPublicId = post.media[0].publicId;
    } else {
      post.imageUrl = '';
      post.mediaUrl = '';
      post.mediaType = 'none';
      post.cloudinaryPublicId = '';
    }

    if (req.body.location !== undefined) {
      if (req.body.location === null || req.body.location === '') {
        post.location = undefined;
      } else {
        try {
          post.location = typeof req.body.location === 'string' ? JSON.parse(req.body.location) : req.body.location;
        } catch (err) {
          console.error('Failed to parse location in updatePost:', err);
        }
      }
    }

    const updatedPost = await post.save();
    const populated = await Post.findById(updatedPost._id).populate(
      'author',
      'username fullName profilePicture'
    );

    const { handleMentions } = require('../utils/mentionHelper');
    await handleMentions(content, req.user.id, { post: updatedPost._id }, 'mentioned you in a post');

    res.json({ success: true, data: populated });
  } catch (error) {
    // Failed upload cleanup to prevent orphan files in storage on DB error
    if (newMedia && newMedia.length > 0) {
      for (const m of newMedia) {
        if (m.publicId && !m.publicId.startsWith('external_url_')) {
          await cloudinary.uploader.destroy(m.publicId, { resource_type: m.resourceType || 'image' }).catch(() => {});
        }
      }
    }
    console.error('Error updating post:', error);
    res.status(500).json({ success: false, error: 'Server error updating post' });
  }
};

// @desc    Delete a post
// @route   DELETE /api/posts/:id
// @access  Protected
const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Check ownership
    if (post.author.toString() !== req.user.id) {
      return res.status(401).json({ success: false, error: 'Not authorized to delete this post' });
    }

    // Delete post comments
    await Comment.deleteMany({ post: post._id });

    // Delete associated media from Cloudinary
    if (post.media && post.media.length > 0) {
      for (const m of post.media) {
        if (m.publicId && !m.publicId.startsWith('external_url_')) {
          try {
            await cloudinary.uploader.destroy(m.publicId, { resource_type: m.resourceType || 'image' });
          } catch (err) {
            console.error('Failed to delete Cloudinary asset upon post deletion:', err);
          }
        }
      }
    } else if (post.cloudinaryPublicId) {
      // Fallback for posts without the media array
      try {
        await cloudinary.uploader.destroy(post.cloudinaryPublicId, { resource_type: post.mediaType || 'image' });
      } catch (err) {
        console.error('Failed to delete Cloudinary asset fallback upon post deletion:', err);
      }
    }

    // Remove from savedPosts of all users
    await User.updateMany(
      { savedPosts: post._id },
      { $pull: { savedPosts: post._id } }
    );

    // Delete post itself
    await Post.deleteOne({ _id: post._id });

    res.json({ success: true, message: 'Post removed' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ success: false, error: 'Server error deleting post' });
  }
};

// @desc    Like a post
// @route   POST /api/posts/:id/like
// @access  Protected
const likePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Check block list
    const postAuthor = await User.findById(post.author);
    if (postAuthor) {
      const isBlockedByAuthor = postAuthor.blockedUsers && postAuthor.blockedUsers.some(b => b.user.toString() === req.user.id);
      const isBlockedBySelf = req.user.blockedUsers && req.user.blockedUsers.some(b => b.user.toString() === postAuthor._id.toString());
      if (isBlockedByAuthor || isBlockedBySelf) {
        return res.status(403).json({ success: false, error: 'Access denied: Blocked user relationship' });
      }
    }

    if (post.likes.includes(req.user.id)) {
      return res.status(400).json({ success: false, error: 'Post already liked' });
    }

    post.likes.push(req.user.id);
    await post.save();

    // Create Notification (only if user likes someone else's post)
    if (post.author.toString() !== req.user.id) {
      await Notification.create({
        recipient: post.author,
        type: 'like',
        sender: req.user.id,
        post: post._id
      });
    }

    res.json({ success: true, message: 'Post liked successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Unlike a post
// @route   DELETE /api/posts/:id/like
// @access  Protected
const unlikePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if (!post.likes.includes(req.user.id)) {
      return res.status(400).json({ success: false, error: 'Post has not been liked' });
    }

    post.likes = post.likes.filter((userId) => userId.toString() !== req.user.id);
    await post.save();

    res.json({ success: true, message: 'Post unliked successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get posts for a specific user (displayed on profile page)
// @route   GET /api/posts/user/:userId
// @access  Protected
const getUserPosts = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check block list
    const isBlockedByTarget = targetUser.blockedUsers && targetUser.blockedUsers.some(b => b.user.toString() === req.user.id);
    const isBlockedBySelf = req.user.blockedUsers && req.user.blockedUsers.some(b => b.user.toString() === targetUser._id.toString());
    if (isBlockedByTarget || isBlockedBySelf) {
      return res.status(403).json({ success: false, error: 'Access denied: Blocked user relationship' });
    }

    // Exclude posts if target user is private and current user is not owner and not follower
    const isFollowerOfTarget = targetUser.followers.some(id => id.toString() === req.user.id);
    if (targetUser.isPrivate && req.params.userId !== req.user.id && !isFollowerOfTarget) {
      return res.json({ success: true, data: [] });
    }

    const currentUser = await User.findById(req.user.id);
    const savedPostIds = currentUser ? (currentUser.savedPosts || []).map(id => id.toString()) : [];

    let postQuery = {
      author: req.params.userId,
      isDeleted: false
    };

    if (req.params.userId !== req.user.id) {
      postQuery.isHidden = false;
      postQuery.isArchived = { $ne: true };

      // Check if they are friends
      const isFollowing = targetUser.followers.some(id => id.toString() === req.user.id);
      const isFollowedBy = targetUser.following.some(id => id.toString() === req.user.id);
      const isFriend = isFollowing && isFollowedBy;

      postQuery.$or = [
        { audience: { $in: ['Public', null, undefined] } }
      ];
      if (isFriend) {
        postQuery.$or.push({ audience: 'Friends' });
      }
    }

    const posts = await Post.find(postQuery)
      .populate('author', 'username fullName profilePicture')
      .sort({ createdAt: -1 });

    const postsWithDetails = await Promise.all(
      posts.map(async (post) => {
        const commentCount = await Comment.countDocuments({ post: post._id });
        return {
          ...post._doc,
          commentCount,
          likesCount: post.likes.length,
          isLiked: post.likes.includes(req.user.id),
          isSaved: savedPostIds.includes(post._id.toString())
        };
      })
    );

    res.json({ success: true, data: postsWithDetails });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Save a post to user's bookmarks
// @route   POST /api/posts/:id/save
// @access  Protected
const savePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.savedPosts) {
      user.savedPosts = [];
    }

    if (user.savedPosts.includes(post._id)) {
      return res.status(400).json({ success: false, error: 'Post already saved' });
    }

    user.savedPosts.push(post._id);
    await user.save();

    res.json({ success: true, message: 'Post saved successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Remove a post from user's bookmarks
// @route   DELETE /api/posts/:id/save
// @access  Protected
const unsavePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.savedPosts || !user.savedPosts.includes(post._id)) {
      return res.status(400).json({ success: false, error: 'Post has not been saved' });
    }

    user.savedPosts = user.savedPosts.filter((id) => id.toString() !== post._id.toString());
    await user.save();

    res.json({ success: true, message: 'Post unsaved successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get all saved posts of the user
// @route   GET /api/posts/saved
// @access  Protected
const getSavedPosts = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'savedPosts',
      populate: {
        path: 'author',
        select: 'username fullName profilePicture'
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const validSavedPosts = (user.savedPosts || []).filter(post => post !== null);

    const postsWithDetails = await Promise.all(
      validSavedPosts.map(async (post) => {
        const commentCount = await Comment.countDocuments({ post: post._id });
        return {
          ...post._doc,
          commentCount,
          likesCount: post.likes.length,
          isLiked: post.likes.includes(req.user.id),
          isSaved: true
        };
      })
    );

    // Newest saved first
    postsWithDetails.reverse();

    res.json({ success: true, data: postsWithDetails });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get posts by location placeId
// @route   GET /api/posts/location/:placeId
// @access  Protected
const getPostsByLocation = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const savedPostIds = currentUser ? (currentUser.savedPosts || []).map(id => id.toString()) : [];

    const posts = await Post.find({ 
      'location.placeId': req.params.placeId,
      isDeleted: false,
      isHidden: false
    })
      .populate('author', 'username fullName profilePicture')
      .sort({ createdAt: -1 });

    const postsWithDetails = await Promise.all(
      posts.map(async (post) => {
        const author = await User.findById(post.author._id);
        if (!author) return null;

        const isAuthor = author._id.toString() === req.user.id;

        // 1. Audience Filter
        if (post.audience === 'Only me' && !isAuthor) {
          return null;
        }

        const isFollowing = author.followers.some(id => id.toString() === req.user.id);
        const isFollowedBy = author.following.some(id => id.toString() === req.user.id);
        const isFriend = isFollowing && isFollowedBy;

        if (post.audience === 'Friends' && !isAuthor && !isFriend) {
          return null;
        }

        // 2. Private User Filter
        if (author.isPrivate && !isAuthor && !isFriend) {
          return null; // Skip private non-friend posts
        }

        const commentCount = await Comment.countDocuments({ post: post._id });
        return {
          ...post._doc,
          commentCount,
          likesCount: post.likes.length,
          isLiked: post.likes.includes(req.user.id),
          isSaved: savedPostIds.includes(post._id.toString())
        };
      })
    );

    // Filter out nulls from private non-friend posts
    const visiblePosts = postsWithDetails.filter(p => p !== null);

    res.json({ success: true, data: visiblePosts });
  } catch (error) {
    console.error('Error in getPostsByLocation:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
  getPostFeed,
  createPost,
  getPostById,
  updatePost,
  deletePost,
  likePost,
  unlikePost,
  getUserPosts,
  savePost,
  unsavePost,
  getSavedPosts,
  getPostsByLocation
};

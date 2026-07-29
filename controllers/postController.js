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

    // Find all users in feedUserIds who are private (isPrivate: true) and NOT the current user
    const privateUsers = await User.find({
      _id: { $in: feedUserIds, $ne: req.user.id },
      isPrivate: true
    }).select('_id');
    const privateUserIds = privateUsers.map(u => u._id.toString());

    // Filter feedUserIds to exclude those private users
    const filteredFeedUserIds = feedUserIds.filter(id => !privateUserIds.includes(id.toString()));

    // Find posts, populate author details, order by createdAt desc
    const posts = await Post.find({ author: { $in: filteredFeedUserIds } })
      .populate('author', 'username fullName profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPosts = await Post.countDocuments({ author: { $in: filteredFeedUserIds } });
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
  try {
    const { content, imageUrlUrl } = req.body;

    const files = req.files || [];

    if (!content && files.length === 0 && !imageUrlUrl) {
      return res.status(400).json({ success: false, error: 'Post must contain content or media' });
    }

    const media = [];

    // 1. Validate files if present
    if (files.length > 0) {
      for (const file of files) {
        const isVideo = file.mimetype.startsWith('video/');
        const isImage = file.mimetype.startsWith('image/');

        if (!isVideo && !isImage) {
          return res.status(400).json({
            success: false,
            error: `Unsupported file type for file: ${file.originalname}. Only JPEG, JPG, PNG, WEBP and MP4, MOV, WEBM are supported.`
          });
        }

        if (isImage && file.size > 5 * 1024 * 1024) {
          return res.status(400).json({
            success: false,
            error: `Image ${file.originalname} exceeds the 5MB size limit.`
          });
        }

        if (isVideo && file.size > 100 * 1024 * 1024) {
          return res.status(400).json({
            success: false,
            error: `Video ${file.originalname} exceeds the 100MB size limit.`
          });
        }
      }

      // 2. Upload files to Cloudinary
      for (const file of files) {
        const isVideo = file.mimetype.startsWith('video/');
        const resourceType = isVideo ? 'video' : 'image';
        const folder = isVideo ? 'connecthub/posts/videos' : 'connecthub/posts/images';

        const result = await uploadStream(file.buffer, folder, resourceType);

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

    const newPost = await Post.create({
      author: req.user.id,
      content,
      imageUrl,
      mediaUrl,
      mediaType,
      cloudinaryPublicId,
      media
    });

    const populatedPost = await Post.findById(newPost._id).populate(
      'author',
      'username fullName profilePicture'
    );

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
  try {
    let post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Check post ownership
    if (post.author.toString() !== req.user.id) {
      return res.status(401).json({ success: false, error: 'Not authorized to edit this post' });
    }

    const { content, imageUrlUrl } = req.body;
    post.content = content !== undefined ? content : post.content;

    // 1. Determine remaining media
    let remainingMedia = [];
    if (req.body.existingMedia) {
      try {
        remainingMedia = JSON.parse(req.body.existingMedia);
      } catch (err) {
        remainingMedia = [];
      }
    } else {
      // Default to keeping current media if existingMedia field not sent
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

    // 3. Validate new files if any
    const files = req.files || [];
    const newMediaItems = [];

    if (files.length > 0) {
      for (const file of files) {
        const isVideo = file.mimetype.startsWith('video/');
        const isImage = file.mimetype.startsWith('image/');

        if (!isVideo && !isImage) {
          return res.status(400).json({
            success: false,
            error: `Unsupported file type for file: ${file.originalname}. Only JPEG, JPG, PNG, WEBP and MP4, MOV, WEBM are supported.`
          });
        }

        if (isImage && file.size > 5 * 1024 * 1024) {
          return res.status(400).json({
            success: false,
            error: `Image ${file.originalname} exceeds the 5MB size limit.`
          });
        }

        if (isVideo && file.size > 100 * 1024 * 1024) {
          return res.status(400).json({
            success: false,
            error: `Video ${file.originalname} exceeds the 100MB size limit.`
          });
        }
      }

      // 4. Upload new files to Cloudinary
      for (const file of files) {
        const isVideo = file.mimetype.startsWith('video/');
        const resourceType = isVideo ? 'video' : 'image';
        const folder = isVideo ? 'connecthub/posts/videos' : 'connecthub/posts/images';

        const result = await uploadStream(file.buffer, folder, resourceType);

        newMediaItems.push({
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
    } else if (imageUrlUrl) {
      // If client sent imageUrlUrl and we didn't have it before
      const hasUrl = remainingMedia.some(m => m.url === imageUrlUrl.trim());
      if (!hasUrl) {
        let formattedUrl = imageUrlUrl.trim();
        if (formattedUrl && !/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith('/')) {
          formattedUrl = 'https://' + formattedUrl;
        }
        newMediaItems.push({
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
    post.media = [...remainingMedia, ...newMediaItems];

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

    const updatedPost = await post.save();
    const populated = await Post.findById(updatedPost._id).populate(
      'author',
      'username fullName profilePicture'
    );

    res.json({ success: true, data: populated });
  } catch (error) {
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

    // Exclude posts if target user is private and is not the current user
    if (targetUser.isPrivate && req.params.userId !== req.user.id) {
      return res.json({ success: true, data: [] });
    }

    const currentUser = await User.findById(req.user.id);
    const savedPostIds = currentUser ? (currentUser.savedPosts || []).map(id => id.toString()) : [];

    const posts = await Post.find({ author: req.params.userId })
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
  getSavedPosts
};

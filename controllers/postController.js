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

    // Find posts, populate author details, order by createdAt desc
    const posts = await Post.find({ author: { $in: feedUserIds } })
      .populate('author', 'username fullName profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPosts = await Post.countDocuments({ author: { $in: feedUserIds } });
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

    if (!content && !req.file && !imageUrlUrl) {
      return res.status(400).json({ success: false, error: 'Post must contain content or an image' });
    }

    let imageUrl = '';
    let mediaUrl = '';
    let mediaType = 'none';
    let cloudinaryPublicId = '';

    // Handle uploaded file if present
    if (req.file) {
      const isVideo = req.file.mimetype.startsWith('video/');
      const resourceType = isVideo ? 'video' : 'image';
      
      const result = await uploadStream(req.file.buffer, 'connecthub/posts', resourceType);
      
      mediaUrl = result.secure_url;
      imageUrl = result.secure_url; // Backward compatibility
      mediaType = result.resource_type; // 'image' or 'video'
      cloudinaryPublicId = result.public_id;
    } else if (imageUrlUrl) {
      let formattedUrl = imageUrlUrl.trim();
      if (formattedUrl && !/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith('/')) {
        formattedUrl = 'https://' + formattedUrl;
      }
      imageUrl = formattedUrl;
      mediaUrl = formattedUrl;
      mediaType = 'image';
    }

    const newPost = await Post.create({
      author: req.user.id,
      content,
      imageUrl,
      mediaUrl,
      mediaType,
      cloudinaryPublicId
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
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
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

    // Helper to delete old Cloudinary media
    const deleteCloudinaryMedia = async (publicId, type) => {
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId, { resource_type: type || 'image' });
        } catch (err) {
          console.error('Failed to delete Cloudinary media:', err);
        }
      }
    };

    // Handle file upload or image url
    if (req.file) {
      if (post.cloudinaryPublicId) {
        await deleteCloudinaryMedia(post.cloudinaryPublicId, post.mediaType);
      }
      const isVideo = req.file.mimetype.startsWith('video/');
      const resourceType = isVideo ? 'video' : 'image';
      
      const result = await uploadStream(req.file.buffer, 'connecthub/posts', resourceType);
      
      post.mediaUrl = result.secure_url;
      post.imageUrl = result.secure_url;
      post.mediaType = result.resource_type;
      post.cloudinaryPublicId = result.public_id;
    } else if (imageUrlUrl) {
      if (post.cloudinaryPublicId) {
        await deleteCloudinaryMedia(post.cloudinaryPublicId, post.mediaType);
      }
      let formattedUrl = imageUrlUrl.trim();
      if (formattedUrl && !/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith('/')) {
        formattedUrl = 'https://' + formattedUrl;
      }
      post.imageUrl = formattedUrl;
      post.mediaUrl = formattedUrl;
      post.mediaType = 'image';
      post.cloudinaryPublicId = '';
    }

    const updatedPost = await post.save();
    const populated = await Post.findById(updatedPost._id).populate(
      'author',
      'username fullName profilePicture'
    );

    res.json({ success: true, data: populated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
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
    if (post.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(post.cloudinaryPublicId, { resource_type: post.mediaType || 'image' });
      } catch (err) {
        console.error('Failed to delete Cloudinary asset upon post deletion:', err);
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
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
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

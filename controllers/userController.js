const mongoose = require('mongoose');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Post = require('../models/Post');
const Image = require('../models/Image');
const Comment = require('../models/Comment');
const { cloudinary, uploadStream } = require('../config/cloudinary');

// @desc    Get user profile by ID
// @route   GET /api/users/:id
// @access  Protected/Public (if public, show profile details)
const getUserProfile = async (req, res) => {
  try {
    const isId = mongoose.Types.ObjectId.isValid(req.params.id);
    const query = isId ? { _id: req.params.id } : { username: req.params.id.toLowerCase() };
    const user = await User.findOne(query)
      .select('-passwordHash')
      .populate('followers', 'username fullName profilePicture')
      .populate('following', 'username fullName profilePicture');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get user's post count
    const postCount = await Post.countDocuments({ author: user._id });

    // Calculate relationshipStatus relative to req.user.id
    let relationshipStatus = 'follow';
    if (user._id.toString() !== req.user.id) {
      const isFollowing = user.followers.some(f => f._id.toString() === req.user.id);
      const isFollowedBy = user.following.some(f => f._id.toString() === req.user.id);
      if (isFollowing && isFollowedBy) {
        relationshipStatus = 'friends';
      } else if (isFollowing) {
        relationshipStatus = 'following';
      } else if (isFollowedBy) {
        relationshipStatus = 'follow_back';
      }
    }

    // Send data
    res.json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        bio: user.bio,
        location: user.location,
        profilePicture: user.profilePicture,
        coverPhoto: user.coverPhoto,
        followersCount: user.followers.length,
        followingCount: user.following.length,
        followers: user.followers,
        following: user.following,
        postCount,
        createdAt: user.createdAt,
        relationshipStatus,
        birthday: user.birthday
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/:id
// @access  Protected
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if the logged in user is editing their own profile
    if (user._id.toString() !== req.user.id) {
      return res.status(401).json({ success: false, error: 'User not authorized to edit this profile' });
    }

    const { username, fullName, bio, location, birthday, profilePictureUrl, coverPhotoUrl } = req.body;

    if (username && username.trim().toLowerCase() !== user.username.toLowerCase()) {
      const targetUsername = username.trim().toLowerCase();
      if (targetUsername.length < 3) {
        return res.status(400).json({ success: false, error: 'Username must be at least 3 characters' });
      }
      const existingUser = await User.findOne({ username: targetUsername });
      if (existingUser) {
        return res.status(400).json({ success: false, error: 'Username is already taken' });
      }
      user.username = targetUsername;
    }

    user.fullName = fullName || user.fullName;
    user.bio = bio !== undefined ? bio : user.bio;
    user.location = location !== undefined ? location : user.location;
    if (birthday !== undefined) {
      user.birthday = birthday ? new Date(birthday) : null;
    }

    // Helper to delete old Cloudinary image
    const deleteCloudinaryImage = async (publicId) => {
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.error('Failed to delete Cloudinary profile media:', err);
        }
      }
    };

    // Handle files if uploaded via multer
    if (req.files) {
      // 1. Validate files first
      if (req.files.profilePicture) {
        const file = req.files.profilePicture[0];
        if (!file.mimetype.startsWith('image/')) {
          return res.status(400).json({ success: false, error: 'Profile picture must be an image file' });
        }
        if (file.size > 5 * 1024 * 1024) {
          return res.status(400).json({ success: false, error: 'Profile picture exceeds the 5MB size limit.' });
        }
      }
      if (req.files.coverPhoto) {
        const file = req.files.coverPhoto[0];
        if (!file.mimetype.startsWith('image/')) {
          return res.status(400).json({ success: false, error: 'Cover photo must be an image file' });
        }
        if (file.size > 5 * 1024 * 1024) {
          return res.status(400).json({ success: false, error: 'Cover photo exceeds the 5MB size limit.' });
        }
      }

      // 2. Upload files if valid
      if (req.files.profilePicture) {
        const file = req.files.profilePicture[0];
        if (user.profilePicturePublicId) {
          await deleteCloudinaryImage(user.profilePicturePublicId);
        }
        const result = await uploadStream(file.buffer, 'connecthub/profiles/avatars', 'image');
        user.profilePicture = result.secure_url;
        user.profilePicturePublicId = result.public_id;
      }
      if (req.files.coverPhoto) {
        const file = req.files.coverPhoto[0];
        if (user.coverPhotoPublicId) {
          await deleteCloudinaryImage(user.coverPhotoPublicId);
        }
        const result = await uploadStream(file.buffer, 'connecthub/profiles/covers', 'image');
        user.coverPhoto = result.secure_url;
        user.coverPhotoPublicId = result.public_id;
      }
    }

    // Handle URL if provided in JSON body (only if file wasn't uploaded)
    if (profilePictureUrl && (!req.files || !req.files.profilePicture)) {
      let formattedUrl = profilePictureUrl.trim();
      if (formattedUrl && !/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith('/')) {
        formattedUrl = 'https://' + formattedUrl;
      }
      if (user.profilePicturePublicId) {
        await deleteCloudinaryImage(user.profilePicturePublicId);
      }
      user.profilePicture = formattedUrl;
      user.profilePicturePublicId = '';
    }
    if (coverPhotoUrl && (!req.files || !req.files.coverPhoto)) {
      let formattedUrl = coverPhotoUrl.trim();
      if (formattedUrl && !/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith('/')) {
        formattedUrl = 'https://' + formattedUrl;
      }
      if (user.coverPhotoPublicId) {
        await deleteCloudinaryImage(user.coverPhotoPublicId);
      }
      user.coverPhoto = formattedUrl;
      user.coverPhotoPublicId = '';
    }

    const updatedUser = await user.save();

    res.json({
      success: true,
      data: {
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        bio: updatedUser.bio,
        location: updatedUser.location,
        profilePicture: updatedUser.profilePicture,
        coverPhoto: updatedUser.coverPhoto,
        followersCount: updatedUser.followers.length,
        followingCount: updatedUser.following.length,
        createdAt: updatedUser.createdAt,
        birthday: updatedUser.birthday
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get user followers
// @route   GET /api/users/:id/followers
// @access  Protected/Public
const getUserFollowers = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('followers', 'username fullName profilePicture bio followers following');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const followersWithStatus = user.followers.map(f => {
      const isFollowing = f.followers.some(id => id.toString() === req.user.id);
      const isFollowedBy = f.following.some(id => id.toString() === req.user.id);
      
      let relationshipStatus = 'follow';
      if (isFollowing && isFollowedBy) {
        relationshipStatus = 'friends';
      } else if (isFollowing) {
        relationshipStatus = 'following';
      } else if (isFollowedBy) {
        relationshipStatus = 'follow_back';
      }

      return {
        _id: f._id,
        username: f.username,
        fullName: f.fullName,
        profilePicture: f.profilePicture,
        bio: f.bio,
        relationshipStatus
      };
    });

    res.json({ success: true, data: followersWithStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get user following
// @route   GET /api/users/:id/following
// @access  Protected/Public
const getUserFollowing = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('following', 'username fullName profilePicture bio followers following');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const followingWithStatus = user.following.map(f => {
      const isFollowing = f.followers.some(id => id.toString() === req.user.id);
      const isFollowedBy = f.following.some(id => id.toString() === req.user.id);
      
      let relationshipStatus = 'follow';
      if (isFollowing && isFollowedBy) {
        relationshipStatus = 'friends';
      } else if (isFollowing) {
        relationshipStatus = 'following';
      } else if (isFollowedBy) {
        relationshipStatus = 'follow_back';
      }

      return {
        _id: f._id,
        username: f.username,
        fullName: f.fullName,
        profilePicture: f.profilePicture,
        bio: f.bio,
        relationshipStatus
      };
    });

    res.json({ success: true, data: followingWithStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Follow a user
// @route   POST /api/users/:id/follow
// @access  Protected
const followUser = async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ success: false, error: 'You cannot follow yourself' });
    }

    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!userToFollow) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (currentUser.following.includes(req.params.id)) {
      return res.status(400).json({ success: false, error: 'You are already following this user' });
    }

    // Add to following/followers lists
    currentUser.following.push(req.params.id);
    userToFollow.followers.push(req.user.id);

    await currentUser.save();
    await userToFollow.save();

    // Create Notification
    await Notification.create({
      recipient: userToFollow._id,
      type: 'follow',
      sender: currentUser._id
    });

    // Check if mutual follow (Friends status)
    const isMutual = userToFollow.following.includes(req.user.id);

    res.json({ 
      success: true, 
      message: 'Successfully followed user',
      relationshipStatus: isMutual ? 'friends' : 'following'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Unfollow a user
// @route   DELETE /api/users/:id/follow
// @access  Protected
const unfollowUser = async (req, res) => {
  try {
    const userToUnfollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!userToUnfollow) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!currentUser.following.includes(req.params.id)) {
      return res.status(400).json({ success: false, error: 'You are not following this user' });
    }

    // Remove from following/followers list
    currentUser.following = currentUser.following.filter(
      (id) => id.toString() !== req.params.id
    );
    userToUnfollow.followers = userToUnfollow.followers.filter(
      (id) => id.toString() !== req.user.id
    );

    await currentUser.save();
    await userToUnfollow.save();

    res.json({ success: true, message: 'Successfully unfollowed user' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get follow suggestions for user
// @route   GET /api/users/explore/suggestions
// @access  Protected
const getFollowSuggestions = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);

    // Find users who are not the current user and not in current user's following list
    const excludedIds = [currentUser._id, ...currentUser.following];

    // Get up to 5 random suggested users
    const suggestions = await User.find({ _id: { $nin: excludedIds } })
      .select('username fullName profilePicture bio followers following')
      .limit(5);

    const suggestionsWithStatus = suggestions.map(u => {
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
        bio: u.bio,
        relationshipStatus
      };
    });

    res.json({ success: true, data: suggestionsWithStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Search for users by username or full name
// @route   GET /api/users/explore/search
// @access  Protected
const searchUsers = async (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query) {
      return res.json({ success: true, data: [] });
    }
    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { fullName: { $regex: query, $options: 'i' } }
      ]
    }).select('username fullName profilePicture bio followers following').limit(10);

    const usersWithStatus = users.map(u => {
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
        bio: u.bio,
        relationshipStatus
      };
    });

    res.json({ success: true, data: usersWithStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Delete user account and all associated data (posts, comments, likes, notifications, follows, images)
// @route   DELETE /api/users/:id
// @access  Protected
const deleteUserAccount = async (req, res) => {
  try {
    const userId = req.params.id;

    // Check authorization
    if (userId !== req.user.id) {
      return res.status(401).json({ success: false, error: 'Not authorized to delete this account' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // 1. Delete user's comments
    await Comment.deleteMany({ author: userId });

    // 2. Delete user's posts and comments on those posts
    const userPosts = await Post.find({ author: userId });
    const userPostIds = userPosts.map(p => p._id);
    
    // Delete comments on these posts
    await Comment.deleteMany({ post: { $in: userPostIds } });
    
    // Delete all posts' media from Cloudinary
    for (const p of userPosts) {
      if (p.media && p.media.length > 0) {
        for (const m of p.media) {
          if (m.publicId && !m.publicId.startsWith('external_url_')) {
            try {
              await cloudinary.uploader.destroy(m.publicId, { resource_type: m.resourceType || 'image' });
            } catch (err) {
              console.error('Failed to delete Cloudinary asset of user post upon account deletion:', err);
            }
          }
        }
      } else if (p.cloudinaryPublicId) {
        try {
          await cloudinary.uploader.destroy(p.cloudinaryPublicId, { resource_type: p.mediaType || 'image' });
        } catch (err) {
          console.error('Failed to delete Cloudinary asset fallback of user post upon account deletion:', err);
        }
      }
    }

    // Delete the posts themselves
    await Post.deleteMany({ author: userId });

    // 3. Delete user's stories and story media from Cloudinary
    const Story = require('../models/Story');
    const userStories = await Story.find({ user: userId });
    for (const story of userStories) {
      if (story.media && story.media.length > 0) {
        for (const m of story.media) {
          if (m.publicId) {
            try {
              await cloudinary.uploader.destroy(m.publicId, { resource_type: m.resourceType || 'image' });
            } catch (err) {
              console.error('Failed to delete user story media from Cloudinary upon account deletion:', err);
            }
          }
        }
      } else if (story.cloudinaryPublicId) {
        try {
          await cloudinary.uploader.destroy(story.cloudinaryPublicId, { resource_type: story.mediaType || 'image' });
        } catch (err) {
          console.error('Failed to delete user story media from Cloudinary upon account deletion:', err);
        }
      }
    }
    await Story.deleteMany({ user: userId });

    // 4. Remove user's ID from other users' followers and following lists
    await User.updateMany(
      { followers: userId },
      { $pull: { followers: userId } }
    );
    await User.updateMany(
      { following: userId },
      { $pull: { following: userId } }
    );

    // 5. Remove user's ID from the likes array of all remaining posts
    await Post.updateMany(
      { likes: userId },
      { $pull: { likes: userId } }
    );

    // 6. Delete all notifications sent by or received by this user
    await Notification.deleteMany({
      $or: [
        { sender: userId },
        { recipient: userId }
      ]
    });

    // 7. Delete profile and cover images from Cloudinary
    const deleteCloudinaryImage = async (publicId) => {
      if (publicId) {
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.error('Failed to delete Cloudinary profile media upon account deletion:', err);
        }
      }
    };
    if (user.profilePicturePublicId) {
      await deleteCloudinaryImage(user.profilePicturePublicId);
    }
    if (user.coverPhotoPublicId) {
      await deleteCloudinaryImage(user.coverPhotoPublicId);
    }

    // 8. Finally delete the user document
    await User.deleteOne({ _id: userId });

    res.json({ success: true, message: 'Account and all associated data deleted successfully' });
  } catch (error) {
    console.error('Error in account deletion:', error);
    res.status(500).json({ success: false, error: 'Server error during account deletion' });
  }
};

// @desc    Remove a follower
// @route   DELETE /api/users/:id/follower
// @access  Protected
const removeFollower = async (req, res) => {
  try {
    const followerToRemove = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!followerToRemove) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Remove followerToRemove from currentUser's followers list
    currentUser.followers = currentUser.followers.filter(
      (id) => id.toString() !== req.params.id
    );
    // Remove currentUser from followerToRemove's following list
    followerToRemove.following = followerToRemove.following.filter(
      (id) => id.toString() !== req.user.id
    );

    await currentUser.save();
    await followerToRemove.save();

    res.json({ success: true, message: 'Successfully removed follower' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  getUserFollowers,
  getUserFollowing,
  followUser,
  unfollowUser,
  getFollowSuggestions,
  searchUsers,
  deleteUserAccount,
  removeFollower
};

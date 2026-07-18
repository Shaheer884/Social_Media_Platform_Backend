const mongoose = require('mongoose');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Post = require('../models/Post');
const Image = require('../models/Image');

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
        relationshipStatus
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

    const { fullName, bio, location, profilePictureUrl, coverPhotoUrl } = req.body;

    user.fullName = fullName || user.fullName;
    user.bio = bio !== undefined ? bio : user.bio;
    user.location = location !== undefined ? location : user.location;

    // Helper to delete database images that are replaced
    const deleteImageIfDatabaseImage = async (imageUrl) => {
      if (imageUrl && imageUrl.startsWith('/uploads/')) {
        const imageId = imageUrl.split('/').pop();
        if (mongoose.Types.ObjectId.isValid(imageId)) {
          await Image.deleteOne({ _id: imageId });
        }
      }
    };

    // Handle files if uploaded via multer
    if (req.files) {
      if (req.files.profilePicture) {
        const file = req.files.profilePicture[0];
        // Delete old profile picture if it's a database image and not default
        if (user.profilePicture && user.profilePicture !== '/uploads/default-avatar.png') {
          await deleteImageIfDatabaseImage(user.profilePicture);
        }
        const newImg = await Image.create({
          data: file.buffer,
          contentType: file.mimetype,
          size: file.size
        });
        user.profilePicture = `/uploads/${newImg._id}`;
      }
      if (req.files.coverPhoto) {
        const file = req.files.coverPhoto[0];
        // Delete old cover photo if it's a database image and not default
        if (user.coverPhoto && user.coverPhoto !== '/uploads/default-cover.png') {
          await deleteImageIfDatabaseImage(user.coverPhoto);
        }
        const newImg = await Image.create({
          data: file.buffer,
          contentType: file.mimetype,
          size: file.size
        });
        user.coverPhoto = `/uploads/${newImg._id}`;
      }
    }

    // Handle URL if provided in JSON body (only if file wasn't uploaded)
    if (profilePictureUrl && (!req.files || !req.files.profilePicture)) {
      let formattedUrl = profilePictureUrl.trim();
      if (formattedUrl && !/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith('/')) {
        formattedUrl = 'https://' + formattedUrl;
      }
      user.profilePicture = formattedUrl;
    }
    if (coverPhotoUrl && (!req.files || !req.files.coverPhoto)) {
      let formattedUrl = coverPhotoUrl.trim();
      if (formattedUrl && !/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith('/')) {
        formattedUrl = 'https://' + formattedUrl;
      }
      user.coverPhoto = formattedUrl;
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
        createdAt: updatedUser.createdAt
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

module.exports = {
  getUserProfile,
  updateUserProfile,
  getUserFollowers,
  getUserFollowing,
  followUser,
  unfollowUser,
  getFollowSuggestions,
  searchUsers
};

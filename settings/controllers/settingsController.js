const mongoose = require('mongoose');
const User = require('../../models/User');
const Post = require('../../models/Post');
const Comment = require('../../models/Comment');
const Notification = require('../../models/Notification');
const { createNotification } = require('../../services/notificationPreferenceService');
const Story = require('../../models/Story');
const { cloudinary, uploadStream } = require('../../config/cloudinary');

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

// @desc    Get user settings
// @route   GET /api/settings
// @access  Protected
const getSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        theme: user.theme || 'system',
        isPrivate: user.isPrivate || false,
        notificationPreferences: user.notificationPreferences || {},
        commentSettings: user.commentSettings || {},
        phone: user.phone || '',
        website: user.website || '',
        gender: user.gender || '',
        email: user.email,
        fullName: user.fullName,
        username: user.username,
        bio: user.bio || '',
        location: user.location || '',
        birthday: user.birthday || null,
        profilePicture: user.profilePicture,
        coverPhoto: user.coverPhoto
      }
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, error: 'Server error fetching settings' });
  }
};

// @desc    Update account details (Profile details)
// @route   PUT /api/settings/account
// @access  Protected
const updateAccountDetails = async (req, res) => {
  let profilePicturePublicId = '';
  let coverPhotoPublicId = '';
  let user;
  try {
    user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const {
      username,
      fullName,
      email,
      bio,
      phone,
      website,
      birthday,
      birthdayPrivacy,
      gender,
      location,
      profilePicture,
      profilePictureSize,
      profilePictureFormat,
      coverPhoto,
      coverPhotoSize,
      coverPhotoFormat
    } = req.body;

    profilePicturePublicId = req.body.profilePicturePublicId || '';
    coverPhotoPublicId = req.body.coverPhotoPublicId || '';

    // Validate Username
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

    // Validate Email
    if (email && email.trim().toLowerCase() !== user.email.toLowerCase()) {
      const targetEmail = email.trim().toLowerCase();
      const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
      if (!emailRegex.test(targetEmail)) {
        return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
      }
      const existingEmail = await User.findOne({ email: targetEmail });
      if (existingEmail) {
        return res.status(400).json({ success: false, error: 'Email is already in use by another account' });
      }
      user.email = targetEmail;
    }

    // Update simple fields
    if (fullName !== undefined) user.fullName = fullName.trim() || user.fullName;
    if (bio !== undefined) user.bio = bio.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (website !== undefined) user.website = website.trim();
    if (location !== undefined) user.location = location.trim();
    if (gender !== undefined) user.gender = gender;
    if (birthday !== undefined) {
      user.birthday = birthday ? new Date(birthday) : null;
    }
    if (birthdayPrivacy !== undefined) {
      user.birthdayPrivacy = birthdayPrivacy;
    }

    // Keep track of newly uploaded publicIds so we can clean them up on failure
    const newUploads = [];
    if (profilePicturePublicId && profilePicturePublicId !== user.profilePicturePublicId) {
      newUploads.push({ publicId: profilePicturePublicId, type: 'image' });
    }
    if (coverPhotoPublicId && coverPhotoPublicId !== user.coverPhotoPublicId) {
      newUploads.push({ publicId: coverPhotoPublicId, type: 'image' });
    }

    const cleanupNewUploads = async () => {
      for (const item of newUploads) {
        if (item.publicId) {
          await cloudinary.uploader.destroy(item.publicId).catch(() => {});
        }
      }
    };

    // Metadata validation
    if (profilePicturePublicId && profilePicturePublicId !== user.profilePicturePublicId) {
      if (profilePictureSize && profilePictureSize > 10 * 1024 * 1024) {
        await cleanupNewUploads();
        return res.status(400).json({ success: false, error: 'Profile picture exceeds 10MB limit.' });
      }
      const format = (profilePictureFormat || '').toLowerCase();
      const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      if (profilePictureFormat && !allowedFormats.includes(format)) {
        await cleanupNewUploads();
        return res.status(400).json({ success: false, error: `Profile picture format "${profilePictureFormat}" is not supported.` });
      }
    }

    if (coverPhotoPublicId && coverPhotoPublicId !== user.coverPhotoPublicId) {
      if (coverPhotoSize && coverPhotoSize > 10 * 1024 * 1024) {
        await cleanupNewUploads();
        return res.status(400).json({ success: false, error: 'Cover photo exceeds 10MB limit.' });
      }
      const format = (coverPhotoFormat || '').toLowerCase();
      const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      if (coverPhotoFormat && !allowedFormats.includes(format)) {
        await cleanupNewUploads();
        return res.status(400).json({ success: false, error: `Cover photo format "${coverPhotoFormat}" is not supported.` });
      }
    }

    // Keep track of old public ids to delete after successful save
    const oldProfilePicPublicId = profilePicturePublicId && profilePicturePublicId !== user.profilePicturePublicId ? user.profilePicturePublicId : null;
    const oldCoverPhotoPublicId = coverPhotoPublicId && coverPhotoPublicId !== user.coverPhotoPublicId ? user.coverPhotoPublicId : null;

    // Apply updates
    if (profilePicturePublicId) {
      user.profilePicture = profilePicture;
      user.profilePicturePublicId = profilePicturePublicId;
    } else if (req.body.profilePictureUrl) {
      let formattedUrl = req.body.profilePictureUrl.trim();
      if (formattedUrl && !/^https?:\/\//i.test(formattedUrl) && !formattedUrl.startsWith('/')) {
        formattedUrl = 'https://' + formattedUrl;
      }
      if (user.profilePicturePublicId) {
        await deleteCloudinaryImage(user.profilePicturePublicId);
      }
      user.profilePicture = formattedUrl;
      user.profilePicturePublicId = '';
    }

    if (coverPhotoPublicId) {
      user.coverPhoto = coverPhoto;
      user.coverPhotoPublicId = coverPhotoPublicId;
    } else if (req.body.coverPhotoUrl) {
      let formattedUrl = req.body.coverPhotoUrl.trim();
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

    // Clean up old resources since save succeeded
    if (oldProfilePicPublicId) {
      await deleteCloudinaryImage(oldProfilePicPublicId);
    }
    if (oldCoverPhotoPublicId) {
      await deleteCloudinaryImage(oldCoverPhotoPublicId);
    }

    res.json({
      success: true,
      message: 'Account details updated successfully',
      data: {
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        bio: updatedUser.bio,
        phone: updatedUser.phone,
        website: updatedUser.website,
        location: updatedUser.location,
        gender: updatedUser.gender,
        birthday: updatedUser.birthday,
        profilePicture: updatedUser.profilePicture,
        coverPhoto: updatedUser.coverPhoto,
        isPrivate: updatedUser.isPrivate
      }
    });
  } catch (error) {
    if (profilePicturePublicId && user && profilePicturePublicId !== user.profilePicturePublicId) {
      await cloudinary.uploader.destroy(profilePicturePublicId).catch(() => {});
    }
    if (coverPhotoPublicId && user && coverPhotoPublicId !== user.coverPhotoPublicId) {
      await cloudinary.uploader.destroy(coverPhotoPublicId).catch(() => {});
    }
    console.error('Error updating account details:', error);
    res.status(500).json({ success: false, error: 'Server error updating account details' });
  }
};

// @desc    Update user theme preference
// @route   PUT /api/settings/theme
// @access  Protected
const updateTheme = async (req, res) => {
  try {
    const { theme } = req.body;
    if (!['light', 'dark', 'system'].includes(theme)) {
      return res.status(400).json({ success: false, error: 'Invalid theme option' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { theme },
      { new: true }
    );

    res.json({ success: true, message: 'Theme updated successfully', data: { theme: user.theme } });
  } catch (error) {
    console.error('Error updating theme:', error);
    res.status(500).json({ success: false, error: 'Server error updating theme' });
  }
};

// @desc    Update notification delivery preferences
// @route   PUT /api/settings/notifications
// @access  Protected
const updateNotifications = async (req, res) => {
  try {
    const { preferences } = req.body;
    if (!preferences) {
      return res.status(400).json({ success: false, error: 'Notification preferences are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.notificationPreferences = {
      ...user.notificationPreferences,
      ...preferences
    };

    await user.save();

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: { notificationPreferences: user.notificationPreferences }
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ success: false, error: 'Server error updating notification preferences' });
  }
};

// @desc    Toggle private account privacy setting
// @route   PUT /api/settings/privacy
// @access  Protected
const updatePrivacy = async (req, res) => {
  try {
    const { isPrivate } = req.body;
    if (isPrivate === undefined) {
      return res.status(400).json({ success: false, error: 'isPrivate status is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.isPrivate = isPrivate;
    await user.save();

    res.json({
      success: true,
      message: `Account is now ${isPrivate ? 'Private' : 'Public'}`,
      data: { isPrivate: user.isPrivate }
    });
  } catch (error) {
    console.error('Error updating privacy:', error);
    res.status(500).json({ success: false, error: 'Server error updating privacy settings' });
  }
};

// @desc    Update comment settings
// @route   PUT /api/settings/comments
// @access  Protected
const updateCommentSettings = async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings) {
      return res.status(400).json({ success: false, error: 'Comment settings are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.commentSettings = {
      ...user.commentSettings,
      ...settings
    };

    await user.save();

    res.json({
      success: true,
      message: 'Comment settings updated successfully',
      data: { commentSettings: user.commentSettings }
    });
  } catch (error) {
    console.error('Error updating comment settings:', error);
    res.status(500).json({ success: false, error: 'Server error updating comment settings' });
  }
};

// @desc    Get blocked users list
// @route   GET /api/settings/blocked
// @access  Protected
const getBlockedUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.q || '';
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const blockedIds = (user.blockedUsers || []).map(b => b.user);

    const query = {
      _id: { $in: blockedIds }
    };

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } }
      ];
    }

    const blockedAccounts = await User.find(query)
      .select('username fullName profilePicture')
      .skip(skip)
      .limit(limit);

    const totalBlocked = await User.countDocuments(query);

    // Map blocked dates back to the list
    const mappedBlocked = blockedAccounts.map(account => {
      const blockRecord = user.blockedUsers.find(b => b.user.toString() === account._id.toString());
      return {
        _id: account._id,
        username: account.username,
        fullName: account.fullName,
        profilePicture: account.profilePicture,
        blockedAt: blockRecord ? blockRecord.blockedAt : null
      };
    });

    res.json({
      success: true,
      data: mappedBlocked,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalBlocked / limit),
        totalBlocked
      }
    });
  } catch (error) {
    console.error('Error fetching blocked users:', error);
    res.status(500).json({ success: false, error: 'Server error fetching blocked list' });
  }
};

// @desc    Block a user
// @route   POST /api/settings/block/:id
// @access  Protected
const blockUser = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    if (targetUserId === req.user.id) {
      return res.status(400).json({ success: false, error: 'You cannot block yourself' });
    }

    const user = await User.findById(req.user.id);
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User to block not found' });
    }

    // Check if already blocked
    const isAlreadyBlocked = user.blockedUsers.some(b => b.user.toString() === targetUserId);
    if (isAlreadyBlocked) {
      return res.status(400).json({ success: false, error: 'User is already blocked' });
    }

    // Add to blockedUsers
    user.blockedUsers.push({ user: targetUserId, blockedAt: new Date() });

    // Pull from followers and following arrays for both users (mutual unfollow)
    user.following = user.following.filter(id => id.toString() !== targetUserId);
    user.followers = user.followers.filter(id => id.toString() !== targetUserId);

    targetUser.following = targetUser.following.filter(id => id.toString() !== req.user.id);
    targetUser.followers = targetUser.followers.filter(id => id.toString() !== req.user.id);

    // Pull from followRequests just in case
    user.followRequests = user.followRequests.filter(id => id.toString() !== targetUserId);
    targetUser.followRequests = targetUser.followRequests.filter(id => id.toString() !== req.user.id);

    await user.save();
    await targetUser.save();

    res.json({ success: true, message: 'User blocked successfully' });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({ success: false, error: 'Server error blocking user' });
  }
};

// @desc    Unblock a user
// @route   DELETE /api/settings/block/:id
// @access  Protected
const unblockUser = async (req, res) => {
  try {
    const targetUserId = req.params.id;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Remove from blockedUsers
    user.blockedUsers = user.blockedUsers.filter(b => b.user.toString() !== targetUserId);
    await user.save();

    res.json({ success: true, message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).json({ success: false, error: 'Server error unblocking user' });
  }
};

// @desc    Get follow requests list
// @route   GET /api/settings/requests
// @access  Protected
const getFollowRequests = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('followRequests', 'username fullName profilePicture bio');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: user.followRequests });
  } catch (error) {
    console.error('Error fetching follow requests:', error);
    res.status(500).json({ success: false, error: 'Server error fetching follow requests' });
  }
};

// @desc    Accept follow request
// @route   POST /api/settings/requests/:id/accept
// @access  Protected
const acceptFollowRequest = async (req, res) => {
  try {
    const requesterId = req.params.id;
    const user = await User.findById(req.user.id);
    const requester = await User.findById(requesterId);

    if (!requester) {
      return res.status(404).json({ success: false, error: 'Requester not found' });
    }

    // Check if request exists
    const hasRequest = user.followRequests.some(id => id.toString() === requesterId);
    if (!hasRequest) {
      return res.status(400).json({ success: false, error: 'No follow request found from this user' });
    }

    // Remove from request list
    user.followRequests = user.followRequests.filter(id => id.toString() !== requesterId);

    // Add to followers/following lists
    if (!user.followers.includes(requesterId)) {
      user.followers.push(requesterId);
    }
    if (!requester.following.includes(req.user.id)) {
      requester.following.push(req.user.id);
    }

    await user.save();
    await requester.save();

    // Create Notification
    await createNotification({
      recipient: requesterId,
      type: 'follow',
      sender: req.user.id,
      message: 'accepted your follow request'
    });

    res.json({ success: true, message: 'Follow request accepted successfully' });
  } catch (error) {
    console.error('Error accepting follow request:', error);
    res.status(500).json({ success: false, error: 'Server error accepting follow request' });
  }
};

// @desc    Reject follow request
// @route   POST /api/settings/requests/:id/reject
// @access  Protected
const rejectFollowRequest = async (req, res) => {
  try {
    const requesterId = req.params.id;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Remove from request list
    user.followRequests = user.followRequests.filter(id => id.toString() !== requesterId);
    await user.save();

    res.json({ success: true, message: 'Follow request rejected' });
  } catch (error) {
    console.error('Error rejecting follow request:', error);
    res.status(500).json({ success: false, error: 'Server error rejecting follow request' });
  }
};

module.exports = {
  getSettings,
  updateAccountDetails,
  updateTheme,
  updateNotifications,
  updatePrivacy,
  updateCommentSettings,
  getBlockedUsers,
  blockUser,
  unblockUser,
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest
};

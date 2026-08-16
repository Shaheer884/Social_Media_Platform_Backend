const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const { cloudinary, uploadStream } = require('../../config/cloudinary');

const dashboardService = require('../services/dashboardService');
const userManagementService = require('../services/userManagementService');
const postManagementService = require('../services/postManagementService');
const commentManagementService = require('../services/commentManagementService');
const reportService = require('../services/reportService');
const notificationService = require('../services/notificationService');
const activityLogService = require('../services/activityLogService');
const recycleBinService = require('../services/recycleBinService');
const platformSettingsService = require('../services/platformSettingsService');
const analyticsService = require('../services/analyticsService');

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @desc    Admin Login
// @route   POST /api/admin/login
// @access  Public
const adminLogin = async (req, res) => {
  const { emailOrUsername, password } = req.body;

  try {
    const user = await User.findOne({
      $or: [
        { email: emailOrUsername.toLowerCase() },
        { username: emailOrUsername.toLowerCase() }
      ]
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Incorrect email/username or password' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized: Admin access only' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Incorrect email/username or password' });
    }

    // Update lastLogin
    user.lastLogin = new Date();
    user.lastActiveAt = new Date();
    await user.save();

    // Log action
    await activityLogService.logAction({
      adminId: user._id,
      adminName: user.fullName,
      action: 'Admin Login',
      target: 'Admin Panel',
      ipAddress: req.ip
    });

    res.json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
        role: user.role,
        token: generateToken(user._id)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error during admin login' });
  }
};

// @desc    Get dashboard metrics & chart data
// @route   GET /api/admin/stats
// @access  Private (Admin)
const getStats = async (req, res) => {
  try {
    const stats = await dashboardService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
};

// @desc    Get active/suspended users list
// @route   GET /api/admin/users
// @access  Private (Admin)
const getUsers = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || '';
  const filter = req.query.filter || '';

  try {
    const result = await userManagementService.getUsers(page, limit, search, filter);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Toggle user suspension
// @route   PUT /api/admin/users/:id/suspend
// @access  Private (Admin)
const suspendUser = async (req, res) => {
  const { id } = req.params;
  const { isSuspended } = req.body;

  try {
    const user = await userManagementService.suspendUser(id, isSuspended);
    
    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: isSuspended ? 'Suspend User' : 'Activate User',
      target: `User: ${user.username} (${user.email})`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: `User status changed to ${isSuspended ? 'Suspended' : 'Active'}.`, data: user });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Soft delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin)
const softDeleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await userManagementService.softDeleteUser(id);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: 'Soft Delete User',
      target: `User: ${user.username}`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'User moved to Recycle Bin.', data: user });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Restore soft deleted user
// @route   POST /api/admin/users/:id/restore
// @access  Private (Admin)
const restoreUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await userManagementService.restoreUser(id);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: 'Restore User',
      target: `User: ${user.username}`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'User account restored successfully.', data: user });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Permanently delete user
// @route   DELETE /api/admin/users/:id/permanent
// @access  Private (Admin)
const permanentDeleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await userManagementService.permanentDeleteUser(id);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: 'Permanently Delete User',
      target: `User Email: ${user.email}`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'User account permanently erased.' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Get posts list
// @route   GET /api/admin/posts
// @access  Private (Admin)
const getPosts = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || '';
  const filterHidden = req.query.filterHidden || '';

  try {
    const result = await postManagementService.getPosts(page, limit, search, filterHidden);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Toggle post hidden state
// @route   PUT /api/admin/posts/:id/hide
// @access  Private (Admin)
const hidePost = async (req, res) => {
  const { id } = req.params;
  const { isHidden } = req.body;

  try {
    const post = await postManagementService.hidePost(id, isHidden);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: isHidden ? 'Hide Post' : 'Unhide Post',
      target: `Post ID: ${post._id} (Author ID: ${post.author})`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: `Post is now ${isHidden ? 'hidden' : 'visible'}.`, data: post });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Soft delete post
// @route   DELETE /api/admin/posts/:id
// @access  Private (Admin)
const softDeletePost = async (req, res) => {
  const { id } = req.params;

  try {
    const post = await postManagementService.softDeletePost(id);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: 'Soft Delete Post',
      target: `Post ID: ${post._id}`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Post moved to Recycle Bin.', data: post });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Restore soft deleted post
// @route   POST /api/admin/posts/:id/restore
// @access  Private (Admin)
const restorePost = async (req, res) => {
  const { id } = req.params;

  try {
    const post = await postManagementService.restorePost(id);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: 'Restore Post',
      target: `Post ID: ${post._id}`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Post restored successfully.', data: post });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Permanently delete post
// @route   DELETE /api/admin/posts/:id/permanent
// @access  Private (Admin)
const permanentDeletePost = async (req, res) => {
  const { id } = req.params;

  try {
    await postManagementService.permanentDeletePost(id);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: 'Permanently Delete Post',
      target: `Post ID: ${id}`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Post and its comments permanently deleted.' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Get comments list
// @route   GET /api/admin/comments
// @access  Private (Admin)
const getComments = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || '';
  const filterHidden = req.query.filterHidden || '';

  try {
    const result = await commentManagementService.getComments(page, limit, search, filterHidden);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Toggle comment hidden state
// @route   PUT /api/admin/comments/:id/hide
// @access  Private (Admin)
const hideComment = async (req, res) => {
  const { id } = req.params;
  const { isHidden } = req.body;

  try {
    const comment = await commentManagementService.hideComment(id, isHidden);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: isHidden ? 'Hide Comment' : 'Unhide Comment',
      target: `Comment ID: ${comment._id}`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: `Comment is now ${isHidden ? 'hidden' : 'visible'}.`, data: comment });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Soft delete comment
// @route   DELETE /api/admin/comments/:id
// @access  Private (Admin)
const softDeleteComment = async (req, res) => {
  const { id } = req.params;

  try {
    const comment = await commentManagementService.softDeleteComment(id);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: 'Soft Delete Comment',
      target: `Comment ID: ${comment._id}`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Comment moved to Recycle Bin.', data: comment });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Restore soft deleted comment
// @route   POST /api/admin/comments/:id/restore
// @access  Private (Admin)
const restoreComment = async (req, res) => {
  const { id } = req.params;

  try {
    const comment = await commentManagementService.restoreComment(id);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: 'Restore Comment',
      target: `Comment ID: ${comment._id}`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Comment restored successfully.', data: comment });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Permanently delete comment
// @route   DELETE /api/admin/comments/:id/permanent
// @access  Private (Admin)
const permanentDeleteComment = async (req, res) => {
  const { id } = req.params;

  try {
    await commentManagementService.permanentDeleteComment(id);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: 'Permanently Delete Comment',
      target: `Comment ID: ${id}`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Comment permanently deleted.' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Get user report tickets
// @route   GET /api/admin/reports
// @access  Private (Admin)
const getReports = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const status = req.query.status || '';
  const reason = req.query.reason || '';

  try {
    const result = await reportService.getReports(page, limit, status, reason);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Resolve/reject a report ticket
// @route   PUT /api/admin/reports/:id/status
// @access  Private (Admin)
const updateReportStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Resolved, Rejected, Under Review

  try {
    const report = await reportService.updateReportStatus(id, status);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: 'Moderate Report Status',
      target: `Report ID: ${id} changed to ${status}`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: `Report status updated to ${status}.`, data: report });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Send system announcement (broadcast)
// @route   POST /api/admin/broadcast
// @access  Private (Admin)
const broadcastAnnouncement = async (req, res) => {
  const { title, message, type } = req.body;

  try {
    const result = await notificationService.broadcastAnnouncement(req.user._id, title, message, type);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: 'Send Broadcast Announcement',
      target: `Title: ${title} (${type})`,
      ipAddress: req.ip
    });

    res.json({ success: true, message: `Announcement broadcasted to ${result.count} users successfully.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get activity logs audit list
// @route   GET /api/admin/activity-logs
// @access  Private (Admin)
const getActivityLogs = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  try {
    const result = await activityLogService.getActivityLogs(page, limit);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get recycle bin soft-deleted items
// @route   GET /api/admin/recycle-bin
// @access  Private (Admin)
const getRecycleBin = async (req, res) => {
  try {
    const items = await recycleBinService.getDeletedItems();
    res.json({ success: true, data: items });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get platform settings
// @route   GET /api/admin/settings
// @access  Private (Admin)
const getSettings = async (req, res) => {
  try {
    const settings = await platformSettingsService.getSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get platform settings (Public route for login/register checks)
// @route   GET /api/admin/settings/public
// @access  Public
const getSettingsPublic = async (req, res) => {
  try {
    const settings = await platformSettingsService.getSettings();
    // Exclude security items if any, but all are safe
    res.json({
      success: true,
      data: {
        platformName: settings.platformName,
        platformLogo: settings.platformLogo,
        maintenanceMode: settings.maintenanceMode,
        allowRegistration: settings.allowRegistration,
        requireEmailVerification: settings.requireEmailVerification,
        maxImageSize: settings.maxImageSize,
        maxVideoSize: settings.maxVideoSize,
        allowedImageTypes: settings.allowedImageTypes,
        allowedVideoTypes: settings.allowedVideoTypes,
        defaultProfileImage: settings.defaultProfileImage
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update platform settings
// @route   PUT /api/admin/settings
// @access  Private (Admin)
const updateSettings = async (req, res) => {
  try {
    const settings = await platformSettingsService.updateSettings(req.body);

    // Log action
    await activityLogService.logAction({
      adminId: req.user._id,
      adminName: req.user.fullName,
      action: 'Change Platform Settings',
      target: 'Settings Console',
      ipAddress: req.ip
    });

    res.json({ success: true, message: 'Platform settings updated successfully.', data: settings });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Get trending content rankings
// @route   GET /api/admin/trending
// @access  Private (Admin)
const getTrending = async (req, res) => {
  try {
    const trending = await analyticsService.getTrendingData();
    res.json({ success: true, data: trending });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    User submitting a moderation report
// @route   POST /api/admin/reports
// @access  Private (User)
const submitReport = async (req, res) => {
  const { targetType, targetId, reason, details } = req.body;

  if (!targetType || !targetId || !reason) {
    return res.status(400).json({ success: false, error: 'Target type, ID, and reason are required.' });
  }

  try {
    const report = await reportService.createReport({
      reporter: req.user.id,
      targetType,
      targetId,
      reason,
      details
    });

    res.status(201).json({ success: true, message: 'Report submitted for review.', data: report });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update Admin Profile
// @route   PUT /api/admin/profile
// @access  Private (Admin)
const updateAdminProfile = async (req, res) => {
  try {
    const admin = await User.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin user not found' });
    }

    const { fullName, username, email, password } = req.body;

    if (username && username.trim().toLowerCase() !== admin.username.toLowerCase()) {
      const targetUsername = username.trim().toLowerCase();
      if (targetUsername.length < 3) {
        return res.status(400).json({ success: false, error: 'Username must be at least 3 characters' });
      }
      const existingUser = await User.findOne({ username: targetUsername });
      if (existingUser) {
        return res.status(400).json({ success: false, error: 'Username is already taken' });
      }
      admin.username = targetUsername;
    }

    if (email && email.trim().toLowerCase() !== admin.email.toLowerCase()) {
      const targetEmail = email.trim().toLowerCase();
      const existingEmail = await User.findOne({ email: targetEmail });
      if (existingEmail) {
        return res.status(400).json({ success: false, error: 'Email is already registered' });
      }
      admin.email = targetEmail;
    }

    admin.fullName = fullName || admin.fullName;

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }
      const salt = await bcrypt.genSalt(10);
      admin.passwordHash = await bcrypt.hash(password, salt);
    }

    // Handle pre-uploaded profile picture details
    const { profilePicture, profilePicturePublicId, profilePictureSize, profilePictureFormat } = req.body;
    const oldAvatarPublicId = (profilePicturePublicId && profilePicturePublicId !== admin.profilePicturePublicId) ? admin.profilePicturePublicId : null;

    if (profilePicturePublicId && profilePicturePublicId !== admin.profilePicturePublicId) {
      // Validate image metadata
      if (profilePictureSize && profilePictureSize > 10 * 1024 * 1024) {
        await cloudinary.uploader.destroy(profilePicturePublicId).catch(() => {});
        return res.status(400).json({ success: false, error: 'Profile picture exceeds 10MB limit.' });
      }
      const format = (profilePictureFormat || '').toLowerCase();
      const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      if (profilePictureFormat && !allowedFormats.includes(format)) {
        await cloudinary.uploader.destroy(profilePicturePublicId).catch(() => {});
        return res.status(400).json({ success: false, error: `Profile picture format "${profilePictureFormat}" is not supported.` });
      }

      admin.profilePicture = profilePicture;
      admin.profilePicturePublicId = profilePicturePublicId;
    }

    await admin.save();

    // Delete old avatar from Cloudinary on success
    if (oldAvatarPublicId) {
      try {
        await cloudinary.uploader.destroy(oldAvatarPublicId);
      } catch (err) {
        console.error('Failed to delete old admin avatar:', err);
      }
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        _id: admin._id,
        username: admin.username,
        email: admin.email,
        fullName: admin.fullName,
        profilePicture: admin.profilePicture,
        role: admin.role
      }
    });
  } catch (error) {
    if (profilePicturePublicId && admin && profilePicturePublicId !== admin.profilePicturePublicId) {
      await cloudinary.uploader.destroy(profilePicturePublicId).catch(() => {});
    }
    console.error('Update admin profile error:', error);
    res.status(500).json({ success: false, error: 'Server error during profile update' });
  }
};

module.exports = {
  adminLogin,
  getStats,
  getUsers,
  suspendUser,
  softDeleteUser,
  restoreUser,
  permanentDeleteUser,
  getPosts,
  hidePost,
  softDeletePost,
  restorePost,
  permanentDeletePost,
  getComments,
  hideComment,
  softDeleteComment,
  restoreComment,
  permanentDeleteComment,
  getReports,
  updateReportStatus,
  broadcastAnnouncement,
  getActivityLogs,
  getRecycleBin,
  getSettings,
  getSettingsPublic,
  updateSettings,
  getTrending,
  submitReport,
  updateAdminProfile
};

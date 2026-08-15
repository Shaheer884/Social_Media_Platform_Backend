const express = require('express');
const { protect } = require('../../middleware/authMiddleware');
const upload = require('../../middleware/uploadMiddleware');
const {
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
} = require('../controllers/settingsController');

const router = express.Router();

// Retrieve all settings preferences
router.get('/', protect, getSettings);

// Account updates (supports profile picture & cover photo uploads)
router.put(
  '/account',
  protect,
  upload.fields([
    { name: 'profilePicture', maxCount: 1 },
    { name: 'coverPhoto', maxCount: 1 }
  ]),
  updateAccountDetails
);

// Settings Toggles
router.put('/theme', protect, updateTheme);
router.put('/notifications', protect, updateNotifications);
router.put('/privacy', protect, updatePrivacy);
router.put('/comments', protect, updateCommentSettings);

// Block management
router.get('/blocked', protect, getBlockedUsers);
router.post('/block/:id', protect, blockUser);
router.delete('/block/:id', protect, unblockUser);

// Follow requests (Private Account specific)
router.get('/requests', protect, getFollowRequests);
router.post('/requests/:id/accept', protect, acceptFollowRequest);
router.post('/requests/:id/reject', protect, rejectFollowRequest);

module.exports = router;

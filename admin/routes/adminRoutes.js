const express = require('express');
const router = express.Router();

const { authenticateAdmin } = require('../middleware/adminAuthMiddleware');
const { protect } = require('../../middleware/authMiddleware'); // Existing auth middleware
const upload = require('../../middleware/uploadMiddleware');

const {
  validateSettings,
  validateBroadcast,
  checkValidation
} = require('../validations/adminValidation');

const {
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
} = require('../controllers/adminController');

// Public routes
router.post('/login', adminLogin);
router.get('/settings/public', getSettingsPublic);

// Report creation (Standard protected route for any logged-in user to report items)
router.post('/reports', protect, submitReport);

// Admin-only protected routes
router.put('/profile', authenticateAdmin, upload.fields([{ name: 'profilePicture', maxCount: 1 }]), updateAdminProfile);
router.get('/stats', authenticateAdmin, getStats);
router.get('/trending', authenticateAdmin, getTrending);
router.get('/recycle-bin', authenticateAdmin, getRecycleBin);
router.get('/activity-logs', authenticateAdmin, getActivityLogs);

// Platform Settings (Admin)
router.get('/settings', authenticateAdmin, getSettings);
router.put('/settings', authenticateAdmin, validateSettings, checkValidation, updateSettings);

// Broadcast Notification announcements (Admin)
router.post('/broadcast', authenticateAdmin, validateBroadcast, checkValidation, broadcastAnnouncement);

// User Management (Admin)
router.get('/users', authenticateAdmin, getUsers);
router.put('/users/:id/suspend', authenticateAdmin, suspendUser);
router.delete('/users/:id', authenticateAdmin, softDeleteUser);
router.post('/users/:id/restore', authenticateAdmin, restoreUser);
router.delete('/users/:id/permanent', authenticateAdmin, permanentDeleteUser);

// Post Management (Admin)
router.get('/posts', authenticateAdmin, getPosts);
router.put('/posts/:id/hide', authenticateAdmin, hidePost);
router.delete('/posts/:id', authenticateAdmin, softDeletePost);
router.post('/posts/:id/restore', authenticateAdmin, restorePost);
router.delete('/posts/:id/permanent', authenticateAdmin, permanentDeletePost);

// Comment Management (Admin)
router.get('/comments', authenticateAdmin, getComments);
router.put('/comments/:id/hide', authenticateAdmin, hideComment);
router.delete('/comments/:id', authenticateAdmin, softDeleteComment);
router.post('/comments/:id/restore', authenticateAdmin, restoreComment);
router.delete('/comments/:id/permanent', authenticateAdmin, permanentDeleteComment);

// Reports Management (Admin)
router.get('/reports', authenticateAdmin, getReports);
router.put('/reports/:id/status', authenticateAdmin, updateReportStatus);

module.exports = router;

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getUserProfile,
  updateUserProfile,
  getUserFollowers,
  getUserFollowing,
  followUser,
  unfollowUser,
  getFollowSuggestions,
  searchUsers
} = require('../controllers/userController');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

// User Profile routes
router.get('/explore/search', protect, searchUsers);
router.get('/explore/suggestions', protect, getFollowSuggestions);
router.get('/:id', protect, getUserProfile);
router.put(
  '/:id',
  protect,
  upload.fields([
    { name: 'profilePicture', maxCount: 1 },
    { name: 'coverPhoto', maxCount: 1 }
  ]),
  updateUserProfile
);

// Follow / Unfollow routes
router.get('/:id/followers', protect, getUserFollowers);
router.get('/:id/following', protect, getUserFollowing);
router.post('/:id/follow', protect, followUser);
router.delete('/:id/follow', protect, unfollowUser);

module.exports = router;

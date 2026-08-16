const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getStories,
  createStory,
  updateStory,
  deleteStory,
  likeStory,
  unlikeStory,
  commentStory,
  viewStory,
  getStoryViews,
  getStoryLikes,
  replyStory,
  getStoryReplies,
  getStoryUploadSignature,
  cleanupStoryMedia
} = require('../controllers/storyController');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/', protect, getStories);
router.get('/sign-upload', protect, getStoryUploadSignature);
router.post('/cleanup-media', protect, cleanupStoryMedia);
router.post('/', protect, createStory);
router.put('/:id', protect, updateStory);
router.delete('/:id', protect, deleteStory);
router.post('/:id/like', protect, likeStory);
router.delete('/:id/like', protect, unlikeStory);
router.post('/:id/comment', protect, commentStory);

// Advanced Story endpoints
router.post('/:id/view', protect, viewStory);
router.get('/:id/views', protect, getStoryViews);
router.get('/:id/likes', protect, getStoryLikes);
router.post('/:id/reply', protect, replyStory);
router.get('/:id/replies', protect, getStoryReplies);

module.exports = router;

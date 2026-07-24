const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getStories,
  createStory,
  updateStory,
  deleteStory,
  likeStory,
  unlikeStory,
  commentStory
} = require('../controllers/storyController');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/', protect, getStories);
router.post('/', protect, upload.single('storyImage'), createStory);
router.put('/:id', protect, updateStory);
router.delete('/:id', protect, deleteStory);
router.post('/:id/like', protect, likeStory);
router.delete('/:id/like', protect, unlikeStory);
router.post('/:id/comment', protect, commentStory);

module.exports = router;

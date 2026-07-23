const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getStories,
  createStory,
  updateStory,
  deleteStory
} = require('../controllers/storyController');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/', protect, getStories);
router.post('/', protect, upload.single('storyImage'), createStory);
router.put('/:id', protect, updateStory);
router.delete('/:id', protect, deleteStory);

module.exports = router;

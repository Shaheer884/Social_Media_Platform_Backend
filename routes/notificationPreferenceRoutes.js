const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getPreferences,
  updatePreferences
} = require('../controllers/notificationPreferenceController');

const router = express.Router();

router.route('/')
  .get(protect, getPreferences)
  .put(protect, updatePreferences);

module.exports = router;

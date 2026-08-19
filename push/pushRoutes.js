const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getVapidPublicKey,
  subscribe,
  unsubscribe,
  testNotification
} = require('./pushController');

const router = express.Router();

// Public key retrieval can be public
router.get('/key', getVapidPublicKey);

// Subscriptions and tests are protected
router.post('/subscribe', protect, subscribe);
router.post('/unsubscribe', protect, unsubscribe);
router.post('/test', protect, testNotification);

module.exports = router;

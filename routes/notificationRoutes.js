const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getNotifications, markNotificationsRead, markNotificationReadOne } = require('../controllers/notificationController');

const router = express.Router();

router.get('/', protect, getNotifications);
router.put('/mark-read', protect, markNotificationsRead);
router.patch('/mark-read', protect, markNotificationsRead);
router.patch('/:id/read', protect, markNotificationReadOne);

module.exports = router;

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getLatestNotifications,
  getNotifications,
  getNotificationDetails,
  markNotificationsRead,
  markNotificationReadOne,
  deleteNotification,
  deleteMultipleNotifications,
  deleteAllNotifications
} = require('../controllers/notificationController');

const router = express.Router();

router.get('/latest', protect, getLatestNotifications);
router.put('/mark-read', protect, markNotificationsRead);
router.patch('/mark-read', protect, markNotificationsRead);
router.delete('/multiple', protect, deleteMultipleNotifications);
router.delete('/', protect, deleteAllNotifications);
router.get('/:id', protect, getNotificationDetails);
router.patch('/:id/read', protect, markNotificationReadOne);
router.delete('/:id', protect, deleteNotification);

router.get('/', protect, getNotifications);

module.exports = router;

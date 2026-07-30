const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getTodayBirthdays,
  getUpcomingBirthdays,
  getReminders,
  postWish,
  postGift,
  getWall,
  editWish,
  getMemories,
  likeWish,
  replyWish,
  deleteWish
} = require('../controllers/birthdayController');

router.use(protect);

router.get('/today', getTodayBirthdays);
router.get('/upcoming', getUpcomingBirthdays);
router.get('/reminders', getReminders);
router.post('/wish', postWish);
router.put('/wish/:wishId', editWish);
router.post('/send-gift', postGift);
router.get('/wall/:userId', getWall);
router.get('/memories/:userId', getMemories);
router.post('/wishes/:wishId/like', likeWish);
router.post('/wishes/:wishId/reply', replyWish);
router.delete('/wishes/:wishId', deleteWish);

module.exports = router;

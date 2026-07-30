const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getTodayBirthdays,
  getUpcomingBirthdays,
  getReminders,
  postWish,
  postGift,
  getWishesAndGifts,
  likeWish,
  replyWish,
  deleteWish
} = require('../controllers/birthdayController');

router.use(protect);

router.get('/today', getTodayBirthdays);
router.get('/upcoming', getUpcomingBirthdays);
router.get('/reminders', getReminders);
router.post('/wish', postWish);
router.post('/send-gift', postGift);
router.get('/wishes/:userId', getWishesAndGifts);
router.post('/wishes/:wishId/like', likeWish);
router.post('/wishes/:wishId/reply', replyWish);
router.delete('/wishes/:wishId', deleteWish);

module.exports = router;

const User = require('../models/User');
const BirthdayWish = require('../models/BirthdayWish');
const BirthdayGift = require('../models/BirthdayGift');
const Notification = require('../models/Notification');

// Helper function to check if requester can see target's birthday
const canSeeBirthday = (requesterId, targetUser) => {
  if (!targetUser.birthday) return false;
  if (targetUser._id.toString() === requesterId.toString()) return true;

  const privacy = targetUser.birthdayPrivacy || 'Public';
  if (privacy === 'Public') return true;

  if (privacy === 'Friends Only') {
    const isFollowing = targetUser.followers.some(id => id.toString() === requesterId.toString());
    const isFollowedBy = targetUser.following.some(id => id.toString() === requesterId.toString());
    return isFollowing && isFollowedBy;
  }

  return false; // 'Only Me' privacy
};

// @desc    Get Today's birthdays
// @route   GET /api/birthday/today
// @access  Protected
const getTodayBirthdays = async (req, res) => {
  try {
    const today = new Date();
    const users = await User.find({ birthday: { $ne: null } })
      .select('username fullName profilePicture birthday birthdayPrivacy followers following');

    const result = [];
    for (const u of users) {
      if (canSeeBirthday(req.user.id, u)) {
        const bday = new Date(u.birthday);
        if (bday.getMonth() === today.getMonth() && bday.getDate() === today.getDate()) {
          const age = today.getFullYear() - bday.getFullYear();
          result.push({
            _id: u._id,
            username: u.username,
            fullName: u.fullName,
            profilePicture: u.profilePicture,
            age,
            birthday: u.birthday
          });
        }
      }
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get Upcoming birthdays (next 7 days)
// @route   GET /api/birthday/upcoming
// @access  Protected
const getUpcomingBirthdays = async (req, res) => {
  try {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const users = await User.find({ birthday: { $ne: null } })
      .select('username fullName profilePicture birthday birthdayPrivacy followers following');

    const result = [];
    for (const u of users) {
      if (canSeeBirthday(req.user.id, u)) {
        const bday = new Date(u.birthday);
        const bdayThisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
        bdayThisYear.setHours(0, 0, 0, 0);

        let targetBday = bdayThisYear;
        if (bdayThisYear < startOfToday) {
          targetBday = new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
          targetBday.setHours(0, 0, 0, 0);
        }

        const diffTime = targetBday.getTime() - startOfToday.getTime();
        const daysRemaining = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (daysRemaining > 0 && daysRemaining <= 7) {
          const age = targetBday.getFullYear() - bday.getFullYear();
          result.push({
            _id: u._id,
            username: u.username,
            fullName: u.fullName,
            profilePicture: u.profilePicture,
            age,
            daysRemaining,
            birthday: u.birthday
          });
        }
      }
    }

    result.sort((a, b) => a.daysRemaining - b.daysRemaining);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get Birthday Reminders (today, tomorrow, next 7 days grouped)
// @route   GET /api/birthday/reminders
// @access  Protected
const getReminders = async (req, res) => {
  try {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const users = await User.find({ birthday: { $ne: null } })
      .select('username fullName profilePicture birthday birthdayPrivacy followers following');

    const todayList = [];
    const tomorrowList = [];
    const upcomingList = [];

    for (const u of users) {
      if (canSeeBirthday(req.user.id, u)) {
        const bday = new Date(u.birthday);
        const bdayThisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
        bdayThisYear.setHours(0, 0, 0, 0);

        let targetBday = bdayThisYear;
        if (bdayThisYear < startOfToday) {
          targetBday = new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
          targetBday.setHours(0, 0, 0, 0);
        }

        const diffTime = targetBday.getTime() - startOfToday.getTime();
        const daysRemaining = Math.round(diffTime / (1000 * 60 * 60 * 24));
        const age = targetBday.getFullYear() - bday.getFullYear();

        const userObj = {
          _id: u._id,
          username: u.username,
          fullName: u.fullName,
          profilePicture: u.profilePicture,
          age,
          birthday: u.birthday,
          daysRemaining
        };

        if (daysRemaining === 0) {
          todayList.push(userObj);
        } else if (daysRemaining === 1) {
          tomorrowList.push(userObj);
        } else if (daysRemaining > 1 && daysRemaining <= 7) {
          upcomingList.push(userObj);
        }
      }
    }

    const sortFn = (a, b) => a.daysRemaining - b.daysRemaining;
    todayList.sort(sortFn);
    tomorrowList.sort(sortFn);
    upcomingList.sort(sortFn);

    res.json({
      success: true,
      data: {
        today: todayList,
        tomorrow: tomorrowList,
        upcoming: upcomingList
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Post Birthday Wish (Write on wall)
// @route   POST /api/birthday/wish
// @access  Protected
const postWish = async (req, res) => {
  try {
    const { recipientId, message } = req.body;

    if (!recipientId || !message) {
      return res.status(400).json({ success: false, error: 'Recipient and message are required' });
    }

    const recipientUser = await User.findById(recipientId);
    if (!recipientUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Verify privacy permissions
    const hasAccess = canSeeBirthday(req.user.id, recipientUser);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'You are not authorized to send wishes to this user according to their privacy settings' });
    }

    // Prevent spam (duplicate wishes on the same day)
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const existingWish = await BirthdayWish.findOne({
      sender: req.user.id,
      recipient: recipientId,
      createdAt: { $gte: startOfToday, $lte: endOfToday }
    });

    if (existingWish) {
      return res.status(400).json({ success: false, error: 'You have already posted a birthday wish today!' });
    }

    const wish = await BirthdayWish.create({
      sender: req.user.id,
      recipient: recipientId,
      message,
      birthdayYear: new Date().getFullYear()
    });

    // Create Notification (if not wishing self)
    if (recipientId !== req.user.id) {
      await Notification.create({
        recipient: recipientId,
        sender: req.user.id,
        type: 'birthday-wish',
        createdAt: today
      });
    }

    const populatedWish = await BirthdayWish.findById(wish._id).populate('sender', 'username fullName profilePicture');

    res.status(201).json({ success: true, data: populatedWish });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Send a virtual gift
// @route   POST /api/birthday/send-gift
// @access  Protected
const postGift = async (req, res) => {
  try {
    const { recipientId, giftType, message } = req.body;

    if (!recipientId || !giftType) {
      return res.status(400).json({ success: false, error: 'Recipient and gift type are required' });
    }

    const recipientUser = await User.findById(recipientId);
    if (!recipientUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Verify privacy permissions
    const hasAccess = canSeeBirthday(req.user.id, recipientUser);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'You are not authorized to send gifts to this user' });
    }

    const gift = await BirthdayGift.create({
      sender: req.user.id,
      recipient: recipientId,
      giftType,
      message: message || '',
      birthdayYear: new Date().getFullYear()
    });

    // Create Notification (if not gifting self)
    if (recipientId !== req.user.id) {
      await Notification.create({
        recipient: recipientId,
        sender: req.user.id,
        type: 'birthday-gift',
        createdAt: new Date()
      });
    }

    const populatedGift = await BirthdayGift.findById(gift._id).populate('sender', 'username fullName profilePicture');

    res.status(201).json({ success: true, data: populatedGift });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get birthday wall for a user (only active on user's actual birthday)
// @route   GET /api/birthday/wall/:userId
// @access  Protected
const getWall = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Verify privacy permissions
    const hasAccess = canSeeBirthday(req.user.id, targetUser);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'You are not authorized to view this user\'s birthday wall' });
    }

    const today = new Date();
    const bday = targetUser.birthday ? new Date(targetUser.birthday) : null;
    const isBirthdayToday = bday && 
      bday.getMonth() === today.getMonth() && 
      bday.getDate() === today.getDate();

    let wishes = [];
    let gifts = [];

    if (isBirthdayToday) {
      const currentYear = today.getFullYear();
      wishes = await BirthdayWish.find({ recipient: req.params.userId, birthdayYear: currentYear })
        .populate('sender', 'username fullName profilePicture')
        .populate('replies.sender', 'username fullName profilePicture')
        .sort({ createdAt: -1 });

      gifts = await BirthdayGift.find({ recipient: req.params.userId, birthdayYear: currentYear })
        .populate('sender', 'username fullName profilePicture')
        .sort({ createdAt: -1 });
    }

    res.json({
      success: true,
      isBirthdayToday: !!isBirthdayToday,
      data: {
        wishes,
        gifts
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Like / unlike a wish
// @route   POST /api/birthday/wishes/:wishId/like
// @access  Protected
const likeWish = async (req, res) => {
  try {
    const wish = await BirthdayWish.findById(req.params.wishId);
    if (!wish) {
      return res.status(404).json({ success: false, error: 'Birthday wish not found' });
    }

    const isLiked = wish.likes.includes(req.user.id);
    if (isLiked) {
      wish.likes = wish.likes.filter(id => id.toString() !== req.user.id);
    } else {
      wish.likes.push(req.user.id);
    }

    await wish.save();
    res.json({ success: true, data: wish });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Reply to a birthday wish
// @route   POST /api/birthday/wishes/:wishId/reply
// @access  Protected
const replyWish = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'Reply message is required' });
    }

    const wish = await BirthdayWish.findById(req.params.wishId);
    if (!wish) {
      return res.status(404).json({ success: false, error: 'Birthday wish not found' });
    }

    wish.replies.push({
      sender: req.user.id,
      message
    });

    await wish.save();

    const updatedWish = await BirthdayWish.findById(wish._id)
      .populate('sender', 'username fullName profilePicture')
      .populate('replies.sender', 'username fullName profilePicture');

    res.status(201).json({ success: true, data: updatedWish });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Delete a birthday wish
// @route   DELETE /api/birthday/wishes/:wishId
// @access  Protected
const deleteWish = async (req, res) => {
  try {
    const wish = await BirthdayWish.findById(req.params.wishId);
    if (!wish) {
      return res.status(404).json({ success: false, error: 'Birthday wish not found' });
    }

    // Only the sender of the wish can delete it
    const isSender = wish.sender.toString() === req.user.id;

    if (!isSender) {
      return res.status(401).json({ success: false, error: 'User not authorized to delete this wish' });
    }

    await BirthdayWish.findByIdAndDelete(req.params.wishId);
    res.json({ success: true, message: 'Birthday wish deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Edit a birthday wish
// @route   PUT /api/birthday/wish/:wishId
// @access  Protected
const editWish = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message content is required' });
    }

    const wish = await BirthdayWish.findById(req.params.wishId);
    if (!wish) {
      return res.status(404).json({ success: false, error: 'Birthday wish not found' });
    }

    // Only the author of the wish can edit it
    if (wish.sender.toString() !== req.user.id) {
      return res.status(401).json({ success: false, error: 'User not authorized to edit this wish' });
    }

    wish.message = message;
    await wish.save();

    const populatedWish = await BirthdayWish.findById(wish._id)
      .populate('sender', 'username fullName profilePicture')
      .populate('replies.sender', 'username fullName profilePicture');

    res.json({ success: true, data: populatedWish });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get birthday memories (previous years' wishes/gifts)
// @route   GET /api/birthday/memories/:userId
// @access  Protected (restricted to profile owner only)
const getMemories = async (req, res) => {
  try {
    // Only the profile owner can view their own memories
    if (req.user.id !== req.params.userId) {
      return res.status(403).json({ success: false, error: 'You are not authorized to view this user\'s birthday memories' });
    }

    const wishes = await BirthdayWish.find({ recipient: req.params.userId })
      .populate('sender', 'username fullName profilePicture')
      .populate('replies.sender', 'username fullName profilePicture')
      .sort({ createdAt: -1 });

    const gifts = await BirthdayGift.find({ recipient: req.params.userId })
      .populate('sender', 'username fullName profilePicture')
      .sort({ createdAt: -1 });

    const memoriesMap = {};

    wishes.forEach(wish => {
      const year = wish.birthdayYear || new Date(wish.createdAt).getFullYear();
      if (!memoriesMap[year]) {
        memoriesMap[year] = { year, wishes: [], gifts: [] };
      }
      memoriesMap[year].wishes.push(wish);
    });

    gifts.forEach(gift => {
      const year = gift.birthdayYear || new Date(gift.createdAt).getFullYear();
      if (!memoriesMap[year]) {
        memoriesMap[year] = { year, wishes: [], gifts: [] };
      }
      memoriesMap[year].gifts.push(gift);
    });

    const memories = Object.values(memoriesMap)
      .map(m => ({
        year: m.year,
        wishesCount: m.wishes.length,
        giftsCount: m.gifts.length,
        wishes: m.wishes,
        gifts: m.gifts
      }))
      .sort((a, b) => b.year - a.year);

    res.json({ success: true, data: memories });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
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
};

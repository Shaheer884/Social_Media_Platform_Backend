const Notification = require('../models/Notification');
const User = require('../models/User');

// Helper to format relationship status for sender info
const formatNotificationSender = (n, currentUserId) => {
  if (!n.sender) return n.toObject ? n.toObject() : n;
  
  const s = n.sender;
  const followers = s.followers || [];
  const following = s.following || [];
  const isFollowing = followers.some(id => id.toString() === currentUserId);
  const isFollowedBy = following.some(id => id.toString() === currentUserId);
  
  let relationshipStatus = 'follow';
  if (isFollowing && isFollowedBy) {
    relationshipStatus = 'friends';
  } else if (isFollowing) {
    relationshipStatus = 'following';
  } else if (isFollowedBy) {
    relationshipStatus = 'follow_back';
  }

  const notificationObj = n.toObject ? n.toObject() : n;
  if (notificationObj.sender) {
    notificationObj.sender.relationshipStatus = relationshipStatus;
    delete notificationObj.sender.followers;
    delete notificationObj.sender.following;
  }
  return notificationObj;
};

// @desc    Get latest notifications for navbar dropdown (max 5)
// @route   GET /api/notifications/latest
// @access  Protected
const getLatestNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user.id,
      deletedByUser: { $ne: true }
    })
      .populate('sender', 'username fullName profilePicture followers following')
      .populate('post', 'content')
      .populate('story', 'text imageUrl backgroundColor')
      .sort({ createdAt: -1 })
      .limit(5);

    const formattedNotifications = notifications.map(n => formatNotificationSender(n, req.user.id));

    // Get total unread count
    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      deletedByUser: { $ne: true },
      $or: [{ read: false }, { isRead: false }]
    });

    res.json({ success: true, data: formattedNotifications, unreadCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get user notifications (all history with pagination, search, filters)
// @route   GET /api/notifications
// @access  Protected
const getNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { filter, search } = req.query;

    // Base query
    let query = {
      recipient: req.user.id,
      deletedByUser: { $ne: true }
    };

    // Apply Filter category
    if (filter && filter !== 'all') {
      if (filter === 'unread') {
        query.$or = [{ read: false }, { isRead: false }];
      } else if (filter === 'read') {
        query.$or = [{ read: true }, { isRead: true }];
      } else if (filter === 'likes') {
        query.type = { $in: ['like', 'story-like'] };
      } else if (filter === 'comments') {
        query.type = { $in: ['comment', 'story-comment', 'story-reply'] };
      } else if (filter === 'follows') {
        query.type = 'follow';
      } else if (filter === 'friend-requests') {
        query.type = { $in: ['friend-request', 'friend-accept'] };
      } else if (filter === 'stories') {
        query.type = { $in: ['story-like', 'story-comment', 'story-reply', 'story-mention'] };
      } else if (filter === 'admin') {
        query.type = 'announcement';
      } else if (filter === 'birthdays') {
        query.type = { $in: ['birthday', 'birthday-wish', 'birthday-gift'] };
      }
    }

    // Apply Search term
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      
      // Find matching users to search notifications by username or full name
      const matchingUsers = await User.find({
        $or: [
          { username: { $regex: searchRegex } },
          { fullName: { $regex: searchRegex } }
        ]
      }).select('_id');
      
      const senderIds = matchingUsers.map(u => u._id);

      // Search matching notifications sender, message body, or type
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { sender: { $in: senderIds } },
            { message: { $regex: searchRegex } },
            { type: { $regex: searchRegex } }
          ]
        }
      ];
    }

    // Perform paginated query
    const totalNotifications = await Notification.countDocuments(query);
    const totalPages = Math.ceil(totalNotifications / limit);

    const notifications = await Notification.find(query)
      .populate('sender', 'username fullName profilePicture followers following')
      .populate('post', 'content')
      .populate('story', 'text imageUrl backgroundColor')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const formattedNotifications = notifications.map(n => formatNotificationSender(n, req.user.id));

    res.json({
      success: true,
      data: formattedNotifications,
      currentPage: page,
      totalPages,
      totalNotifications
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Get single notification details and mark it as read
// @route   GET /api/notifications/:id
// @access  Protected
const getNotificationDetails = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user.id,
      deletedByUser: { $ne: true }
    })
      .populate('sender', 'username fullName profilePicture followers following')
      .populate('post', 'content')
      .populate('story', 'text imageUrl backgroundColor');

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    // Automatically mark as read if it is currently unread
    if (!notification.read || !notification.isRead) {
      notification.read = true;
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();
    }

    const formattedNotification = formatNotificationSender(notification, req.user.id);

    res.json({ success: true, data: formattedNotification });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/mark-read
// @access  Protected
const markNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, $or: [{ read: false }, { isRead: false }], deletedByUser: { $ne: true } },
      { $set: { read: true, isRead: true, readAt: new Date() } }
    );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Mark one notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Protected
const markNotificationReadOne = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id, deletedByUser: { $ne: true } },
      { $set: { read: true, isRead: true, readAt: new Date() } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Delete one notification (soft delete)
// @route   DELETE /api/notifications/:id
// @access  Protected
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id },
      { $set: { deletedByUser: true, deletedAt: new Date() } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Delete multiple notifications (soft delete)
// @route   DELETE /api/notifications/multiple
// @access  Protected
const deleteMultipleNotifications = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'Invalid or missing notification IDs' });
    }

    await Notification.updateMany(
      { _id: { $in: ids }, recipient: req.user.id },
      { $set: { deletedByUser: true, deletedAt: new Date() } }
    );

    res.json({ success: true, message: 'Notifications deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Delete all user notifications (soft delete)
// @route   DELETE /api/notifications
// @access  Protected
const deleteAllNotifications = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id },
      { $set: { deletedByUser: true, deletedAt: new Date() } }
    );

    res.json({ success: true, message: 'All notifications deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
  getLatestNotifications,
  getNotifications,
  getNotificationDetails,
  markNotificationsRead,
  markNotificationReadOne,
  deleteNotification,
  deleteMultipleNotifications,
  deleteAllNotifications
};

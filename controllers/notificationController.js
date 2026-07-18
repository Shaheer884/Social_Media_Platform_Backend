const Notification = require('../models/Notification');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Protected
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .populate('sender', 'username fullName profilePicture followers following')
      .populate('post', 'content')
      .sort({ createdAt: -1 });

    const notificationsWithSenderStatus = notifications.map(n => {
      if (!n.sender) return n;
      
      const s = n.sender;
      const isFollowing = s.followers.some(id => id.toString() === req.user.id);
      const isFollowedBy = s.following.some(id => id.toString() === req.user.id);
      
      let relationshipStatus = 'follow';
      if (isFollowing && isFollowedBy) {
        relationshipStatus = 'friends';
      } else if (isFollowing) {
        relationshipStatus = 'following';
      }

      // Convert mongoose document to plain object to dynamically attach field
      const notificationObj = n.toObject();
      if (notificationObj.sender) {
        notificationObj.sender.relationshipStatus = relationshipStatus;
        // Clean up large arrays to keep response payload small
        delete notificationObj.sender.followers;
        delete notificationObj.sender.following;
      }
      return notificationObj;
    });

    res.json({ success: true, data: notificationsWithSenderStatus });
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
      { recipient: req.user.id, $or: [{ read: false }, { isRead: false }] },
      { $set: { read: true, isRead: true } }
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
      { _id: req.params.id, recipient: req.user.id },
      { $set: { read: true, isRead: true } },
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

module.exports = {
  getNotifications,
  markNotificationsRead,
  markNotificationReadOne
};

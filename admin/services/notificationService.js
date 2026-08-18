const Notification = require('../../models/Notification');
const User = require('../../models/User');
const { shouldCreateNotification } = require('../../services/notificationPreferenceService');

const broadcastAnnouncement = async (adminId, title, message, announcementType) => {
  const users = await User.find({ role: { $ne: 'admin' }, isDeleted: false });
  
  const notifications = [];
  for (const user of users) {
    const isEnabled = await shouldCreateNotification(user._id, 'announcement');
    if (isEnabled) {
      notifications.push({
        recipient: user._id,
        type: 'announcement',
        sender: adminId,
        message: `[${announcementType}] ${title}: ${message}`,
        read: false,
        isRead: false
      });
    }
  }

  if (notifications.length > 0) {
    await Notification.insertMany(notifications);
  }
  return { success: true, count: notifications.length };
};

module.exports = {
  broadcastAnnouncement
};

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
    
    // Send push notification broadcast asynchronously
    try {
      const userIds = notifications.map(n => n.recipient);
      
      // Filter recipients who have push notifications enabled
      const usersWithPush = await User.find({
        _id: { $in: userIds },
        $or: [
          { 'notificationSettings.pushNotifications': { $ne: false } },
          { 'notificationSettings': { $exists: false } }
        ]
      }).select('_id');
      
      const pushRecipients = usersWithPush.map(u => u._id);
      
      if (pushRecipients.length > 0) {
        const adminUser = await User.findById(adminId).select('fullName profilePicture');
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        
        const payload = {
          title: `📢 Announcement: ${title}`,
          body: message,
          icon: adminUser?.profilePicture 
            ? (adminUser.profilePicture.startsWith('http') ? adminUser.profilePicture : `${clientUrl}${adminUser.profilePicture}`)
            : `${clientUrl}/icons/icon-192x192.png`,
          badge: `${clientUrl}/icons/icon-72x72.png`,
          timestamp: Date.now(),
          url: `${clientUrl}/notifications`,
          actions: [
            { action: 'view_announcements', title: '📢 Open Announcements' },
            { action: 'dismiss', title: 'Dismiss' }
          ],
          data: {
            url: `${clientUrl}/notifications`,
            type: 'announcement',
            targetId: null,
            actionsUrls: {
              view_announcements: `${clientUrl}/notifications`
            }
          }
        };
        
        const { sendBulkNotification } = require('../../push/pushService');
        sendBulkNotification(pushRecipients, payload).catch(err => {
          console.error('Error broadcasting system announcement push alerts:', err);
        });
      }
    } catch (err) {
      console.error('Error processing announcement push notifications:', err);
    }
  }
  return { success: true, count: notifications.length };
};

module.exports = {
  broadcastAnnouncement
};

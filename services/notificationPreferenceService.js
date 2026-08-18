const User = require('../models/User');
const Notification = require('../models/Notification');

// Map notification type to preference key
const getPreferenceKey = (type) => {
  const mapping = {
    'like': 'likes',
    'comment': 'comments',
    'story-comment': 'comments',
    'story-reply': 'storyReplies',
    'story-like': 'storyLikes',
    'story-mention': 'storyMentions',
    'mention': 'postMentions',
    'tag': 'tags',
    'follow': 'followers',
    'follow-request': 'friendRequests',
    'friend-request': 'friendRequests',
    'friend-accept': 'friendRequestAccepted',
    'chat': 'messages',
    'birthday': 'birthdayReminders',
    'birthday-wish': 'birthdayWishes',
    'birthday-gift': 'birthdayWishes', // virtual gifts map to birthday wishes/celebrations
    'announcement': 'adminAnnouncements',
    'platform-update': 'platformUpdates'
  };
  return mapping[type];
};

const getPreferenceDefault = (key) => {
  if (key === 'emailNotifications') return false;
  return true;
};

const getNotificationPreferences = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return null;
  return user.notificationSettings || {};
};

const updateNotificationPreferences = async (userId, settings) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  
  if (!user.notificationSettings) {
    user.notificationSettings = {};
  }
  
  // Merge settings
  Object.keys(settings).forEach(key => {
    user.notificationSettings[key] = settings[key];
  });
  
  await user.save();
  return user.notificationSettings;
};

const shouldCreateNotification = async (recipientId, type) => {
  // Security notifications should always bypass preference checks
  if (type === 'security' || type === 'password-changed') {
    return true;
  }
  
  const prefKey = getPreferenceKey(type);
  if (!prefKey) return true; // Default to true if type is not registered
  
  const user = await User.findById(recipientId);
  if (!user) return false;
  
  const settings = user.notificationSettings;
  if (!settings || settings[prefKey] === undefined) {
    return getPreferenceDefault(prefKey);
  }
  
  return settings[prefKey];
};

const shouldSendPush = async (recipientId) => {
  const user = await User.findById(recipientId);
  if (!user) return true;
  const settings = user.notificationSettings;
  if (!settings || settings.pushNotifications === undefined) return true;
  return settings.pushNotifications !== false;
};

const shouldSendEmail = async (recipientId) => {
  const user = await User.findById(recipientId);
  if (!user) return false;
  const settings = user.notificationSettings;
  if (!settings || settings.emailNotifications === undefined) return false;
  return settings.emailNotifications === true;
};

const createNotification = async (data) => {
  const { recipient, type } = data;
  const isEnabled = await shouldCreateNotification(recipient, type);
  if (isEnabled) {
    // Return standard created notification model instance
    return await Notification.create(data);
  }
  return null;
};

module.exports = {
  getNotificationPreferences,
  updateNotificationPreferences,
  shouldCreateNotification,
  shouldSendPush,
  shouldSendEmail,
  createNotification
};

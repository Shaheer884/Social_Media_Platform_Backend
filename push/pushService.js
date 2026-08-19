const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Initialize Web Push VAPID configuration
const initWebPush = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:hafizshaheer88@gmail.com';

  if (!publicKey || !privateKey) {
    console.warn('\n⚠️  WARNING: VAPID keys are missing from .env! Real-Time Push Notifications will be disabled.');
    console.warn('   Run "node push/vapid.js" in the server folder to generate VAPID keys.\n');
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  } catch (error) {
    console.error('❌ Failed to set VAPID details for Web Push:', error);
    return false;
  }
};

const isConfigured = initWebPush();

/**
 * Lightweight helper to parse browser and device type from User-Agent header
 */
const getBrowserAndDevice = (userAgentString) => {
  let browser = 'Unknown';
  let device = 'Desktop';
  
  if (!userAgentString) return { browser, device };
  
  const ua = userAgentString.toLowerCase();
  
  // Device detection
  if (ua.includes('mobi') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) {
    device = 'Mobile';
    if (ua.includes('ipad') || (ua.includes('android') && !ua.includes('mobi'))) {
      device = 'Tablet';
    }
  }
  
  // Browser detection
  if (ua.includes('edg/')) {
    browser = 'Edge';
  } else if (ua.includes('brave')) {
    browser = 'Brave';
  } else if (ua.includes('chrome') || ua.includes('crios')) {
    browser = 'Chrome';
  } else if (ua.includes('firefox') || ua.includes('fxios')) {
    browser = 'Firefox';
  } else if (ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android')) {
    browser = 'Safari';
  } else if (ua.includes('opr/') || ua.includes('opera')) {
    browser = 'Opera';
  }
  
  return { browser, device };
};

/**
 * Resolves the client application base URL dynamically based on environment
 */
const getClientBaseUrl = () => {
  if (process.env.CLIENT_URL) {
    return process.env.CLIENT_URL;
  }
  return process.env.NODE_ENV === 'production'
    ? 'https://social-media-platform-frontend-nine.vercel.app'
    : 'http://localhost:5173';
};

/**
 * Converts a relative path into an absolute client URL for notifications
 */
const getAbsoluteUrl = (pathStr) => {
  if (!pathStr) return undefined;
  if (pathStr.startsWith('http://') || pathStr.startsWith('https://')) {
    return pathStr;
  }
  const clientUrl = getClientBaseUrl();
  return `${clientUrl}${pathStr.startsWith('/') ? '' : '/'}${pathStr}`;
};

/**
 * Format a database Notification model instance into a standard Web Push payload
 */
const buildPayload = (notification) => {
  const senderName = notification.sender?.fullName || 'Someone';
  const type = notification.type;
  
  let title = 'ConnectHub';
  let body = notification.message || 'You have a new update';
  let route = '/notifications';
  let image = undefined;
  let actions = [];
  let actionsUrls = {};

  const icon = getAbsoluteUrl(notification.sender?.profilePicture || '/icons/icon-192x192.png');
  const badge = getAbsoluteUrl('/icons/icon-72x72.png');

  switch (type) {
    case 'like':
    case 'story-like':
      title = `${senderName} liked your ${type === 'like' ? 'post' : 'story'}`;
      body = notification.post?.content 
        ? `"${notification.post.content.substring(0, 60)}${notification.post.content.length > 60 ? '...' : ''}"`
        : 'Liked your content';
      route = (type === 'like' && notification.post?._id) ? `/post/${notification.post._id}` : `/story/${notification.story?._id || ''}`;
      
      if (type === 'like' && notification.post?._id) {
        actions = [
          { action: 'view_post', title: '❤️ View Post' },
          { action: 'dismiss', title: 'Dismiss' }
        ];
        actionsUrls = { view_post: `/post/${notification.post._id}` };
      } else if (notification.story?._id) {
        actions = [
          { action: 'view_story', title: '📖 View Story' },
          { action: 'dismiss', title: 'Dismiss' }
        ];
        actionsUrls = { view_story: `/story/${notification.story._id}` };
      }
      break;

    case 'comment':
    case 'story-comment':
    case 'story-reply':
      title = `${senderName} commented on your ${type === 'comment' ? 'post' : 'story'}`;
      if (type === 'story-reply') title = `${senderName} replied to your story`;
      
      body = notification.comment?.content 
        ? `"${notification.comment.content.substring(0, 60)}${notification.comment.content.length > 60 ? '...' : ''}"`
        : 'Commented on your content';
      
      route = (type === 'comment' && notification.post?._id) ? `/post/${notification.post._id}` : `/story/${notification.story?._id || ''}`;
      
      if (type === 'comment' && notification.post?._id) {
        actions = [
          { action: 'reply', title: '💬 View & Reply' },
          { action: 'dismiss', title: 'Dismiss' }
        ];
        actionsUrls = { reply: `/post/${notification.post._id}` };
      }
      break;

    case 'mention':
    case 'story-mention':
      title = `${senderName} mentioned you`;
      body = notification.comment?.content
        ? `"${notification.comment.content.substring(0, 60)}..."`
        : (notification.post?.content ? `"${notification.post.content.substring(0, 60)}..."` : 'Mentioned you in their content');
      route = notification.post?._id ? `/post/${notification.post._id}` : `/story/${notification.story?._id || ''}`;
      break;

    case 'friend-request':
    case 'follow-request':
      title = `Friend Request`;
      body = `${senderName} sent you a friend request.`;
      route = `/friends`;
      actions = [
        { action: 'accept', title: '🤝 Accept' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
      actionsUrls = { accept: `/friends` };
      break;

    case 'friend-accept':
    case 'follow':
      title = `Friend Request Accepted`;
      body = `${senderName} accepted your request. You are now connected!`;
      route = `/profile/${notification.sender?.username || ''}`;
      actions = [
        { action: 'view_profile', title: '👤 View Profile' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
      actionsUrls = { view_profile: `/profile/${notification.sender?.username || ''}` };
      break;

    case 'chat':
      title = `New Message from ${senderName}`;
      body = notification.message || 'Sent you a message';
      route = `/messages`;
      actions = [
        { action: 'reply_chat', title: '💬 Reply' },
        { action: 'dismiss', title: 'Dismiss' }
      ];
      actionsUrls = { reply_chat: `/messages` };
      break;

    case 'birthday':
      title = `🎂 Birthday Reminder`;
      body = notification.message || `Today is ${senderName}'s birthday! Wish them!`;
      route = `/birthday`;
      break;

    case 'birthday-wish':
    case 'birthday-gift':
      title = `🎂 Birthday Message`;
      body = notification.message || `${senderName} wished you on your birthday!`;
      route = `/birthday`;
      break;

    case 'announcement':
      title = `📢 Announcement`;
      body = notification.message || 'New system announcement';
      route = `/notifications`;
      break;

    case 'security':
    case 'password-changed':
      title = `🛡️ Security Alert`;
      body = notification.message || 'Security update on your account';
      route = `/settings/privacy`;
      break;
      
    default:
      title = 'ConnectHub';
      body = notification.message || 'You have a new notification';
      route = `/notifications`;
      break;
  }

  if (notification.story?.imageUrl) {
    image = getAbsoluteUrl(notification.story.imageUrl);
  } else if (notification.post?.imageUrl) {
    // If it's a post with image, we can display it too!
    image = getAbsoluteUrl(notification.post.imageUrl);
  }

  return {
    title,
    body,
    icon,
    badge,
    image,
    timestamp: notification.createdAt ? new Date(notification.createdAt).getTime() : Date.now(),
    actions,
    data: {
      type,
      targetId: notification.post?._id || notification.story?._id || notification.comment?._id || null,
      route, // Send relative route, e.g. "/post/123"
      notificationId: notification._id || null,
      createdAt: notification.createdAt || new Date(),
      actionsUrls: Object.fromEntries(
        Object.entries(actionsUrls).map(([k, v]) => [k, v]) // Send relative paths!
      )
    }
  };
};

/**
 * Save user subscription token details
 */
const saveSubscription = async (userId, subscriptionData, userAgent) => {
  const { endpoint, keys } = subscriptionData;
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    throw new Error('Invalid subscription payload format');
  }

  const { browser, device } = getBrowserAndDevice(userAgent);

  // Check if this endpoint already exists (prevents duplication)
  let subscription = await PushSubscription.findOne({ endpoint });

  if (subscription) {
    subscription.user = userId;
    subscription.keys = keys;
    subscription.browser = browser;
    subscription.device = device;
    subscription.active = true;
    subscription.updatedAt = new Date();
    subscription.lastUsed = new Date();
    await subscription.save();
  } else {
    subscription = await PushSubscription.create({
      user: userId,
      endpoint,
      keys,
      browser,
      device,
      active: true
    });
  }

  return subscription;
};

/**
 * Remove user subscription by endpoint
 */
const removeSubscription = async (userId, endpoint) => {
  return await PushSubscription.deleteOne({ user: userId, endpoint });
};

/**
 * Helper to process Web Push delivery
 */
const deliverPush = async (sub, payload) => {
  try {
    const pushConfig = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth
      }
    };
    await webpush.sendNotification(pushConfig, JSON.stringify(payload));
    
    // Update lastUsed timestamp
    await PushSubscription.updateOne({ _id: sub._id }, { $set: { lastUsed: new Date(), active: true } });
    return true;
  } catch (err) {
    // If subscription is expired, disabled, or invalid (Gone HTTP 410 or Not Found HTTP 404)
    if (err.statusCode === 410 || err.statusCode === 404) {
      console.log(`🧹 Removing expired subscription for endpoint: ${sub.endpoint}`);
      await PushSubscription.deleteOne({ _id: sub._id });
    } else {
      console.error(`❌ Push delivery failed for endpoint ${sub.endpoint}:`, err.message);
    }
    return false;
  }
};

/**
 * Send push notification to a user's registered devices
 */
const sendPushNotification = async (userId, notification) => {
  if (!isConfigured) return false;

  // Verify that the notification parameter is a valid Mongoose model object and populated
  let populatedNotification = notification;
  if (notification && notification._id && !notification.populated('sender')) {
    populatedNotification = await Notification.findById(notification._id)
      .populate('sender', 'username fullName profilePicture')
      .populate('post', 'content imageUrl')
      .populate('story', 'text imageUrl backgroundColor')
      .populate('comment', 'content');
  }

  if (!populatedNotification) return false;

  // Find all active subscriptions for this recipient
  const subscriptions = await PushSubscription.find({ user: userId, active: true });
  if (subscriptions.length === 0) return false;

  const payload = buildPayload(populatedNotification);

  // Deliver to all registered user devices in parallel
  const sendPromises = subscriptions.map(sub => deliverPush(sub, payload));
  await Promise.all(sendPromises);
  return true;
};

/**
 * Send bulk notifications to multiple users
 */
const sendBulkNotification = async (userIds, payload) => {
  if (!isConfigured || !userIds || userIds.length === 0) return false;

  const subscriptions = await PushSubscription.find({ user: { $in: userIds }, active: true });
  if (subscriptions.length === 0) return false;

  const sendPromises = subscriptions.map(sub => deliverPush(sub, payload));
  await Promise.all(sendPromises);
  return true;
};

/**
 * Send admin announcement broadcast to all users who have announcements enabled
 */
const sendAdminBroadcast = async (payload) => {
  if (!isConfigured) return false;

  // Fetch all users with admin announcements enabled
  const users = await User.find({
    role: { $ne: 'admin' },
    isDeleted: false,
    $or: [
      { 'notificationSettings.adminAnnouncements': { $ne: false } },
      { 'notificationSettings': { $exists: false } }
    ]
  }).select('_id');

  const userIds = users.map(u => u._id);
  return await sendBulkNotification(userIds, payload);
};

/**
 * Check if subscription details are valid
 */
const validateSubscription = (subscription) => {
  return (
    subscription &&
    subscription.endpoint &&
    subscription.keys &&
    subscription.keys.p256dh &&
    subscription.keys.auth
  );
};

/**
 * Clean up invalid or inactive subscriptions older than 90 days
 */
const cleanupExpiredSubscriptions = async () => {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const result = await PushSubscription.deleteMany({
    $or: [
      { active: false },
      { lastUsed: { $lt: ninetyDaysAgo } }
    ]
  });
  console.log(`🧹 Cleaned up ${result.deletedCount} inactive subscriptions.`);
  return result.deletedCount;
};

module.exports = {
  saveSubscription,
  removeSubscription,
  sendPushNotification,
  sendBulkNotification,
  sendAdminBroadcast,
  validateSubscription,
  cleanupExpiredSubscriptions,
  buildPayload
};

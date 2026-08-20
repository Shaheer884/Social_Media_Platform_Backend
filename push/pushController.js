const pushService = require('./pushService');
const PushSubscription = require('../models/PushSubscription');

/**
 * @desc    Get the server's public VAPID key
 * @route   GET /api/push/key
 * @access  Public
 */
const getVapidPublicKey = async (req, res) => {
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return res.status(404).json({
        success: false,
        error: 'VAPID public key not configured on server'
      });
    }
    res.json({ success: true, data: publicKey });
  } catch (error) {
    console.error('Error fetching VAPID public key:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * @desc    Register a new push subscription for the authenticated user
 * @route   POST /api/push/subscribe
 * @access  Private
 */
const subscribe = async (req, res) => {
  try {
    const subscriptionData = req.body;
    if (!pushService.validateSubscription(subscriptionData)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid push subscription details provided'
      });
    }

    const userAgent = req.headers['user-agent'];
    await pushService.saveSubscription(req.user.id, subscriptionData, userAgent);

    res.status(201).json({
      success: true,
      message: 'Push subscription registered successfully'
    });
  } catch (error) {
    console.error('Error registering push subscription:', error);
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
};

/**
 * @desc    Remove an existing push subscription for the authenticated user
 * @route   POST /api/push/unsubscribe
 * @access  Private
 */
const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Subscription endpoint is required'
      });
    }

    await pushService.removeSubscription(req.user.id, endpoint);

    res.json({
      success: true,
      message: 'Push subscription removed successfully'
    });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
};

/**
 * @desc    Send a test push notification to the logged-in user
 * @route   POST /api/push/test
 * @access  Private (Admin or Authenticated User)
 */
const testNotification = async (req, res) => {
  try {
    const subscriptions = await PushSubscription.find({ user: req.user.id, active: true });
    
    if (subscriptions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No active push subscriptions found for your account. Please enable notifications first.'
      });
    }

    // Build a mock notification payload that mimics a real social alert
    const testPayload = {
      title: '🔔 ConnectHub Test Notification',
      body: `Hello ${req.user.fullName}! Your real-time push notification system is working perfectly.`,
      icon: pushService.getAbsoluteUrl(req.user.profilePicture || '/icons/icon-192x192.png'),
      badge: pushService.getAbsoluteUrl('/icons/badge-72x72.png'),
      timestamp: Date.now(),
      url: '/',
      actions: [
        { action: 'view_dashboard', title: '💻 Open Dashboard' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
      data: {
        url: '/',
        type: 'test',
        targetId: null,
        actionsUrls: {
          view_dashboard: '/'
        }
      }
    };

    // Send the test payload to all subscriptions
    const webpush = require('web-push');
    let successfulDeliveries = 0;

    for (const sub of subscriptions) {
      try {
        const pushConfig = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth
          }
        };
        await webpush.sendNotification(pushConfig, JSON.stringify(testPayload));
        successfulDeliveries++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          console.error(`❌ Test push failed for ${sub.endpoint}:`, err.message);
        }
      }
    }

    if (successfulDeliveries === 0) {
      return res.status(502).json({
        success: false,
        error: 'Failed to deliver test notification to any of your registered devices. Subscriptions might have expired.'
      });
    }

    res.json({
      success: true,
      message: `Test notification sent successfully to ${successfulDeliveries} device(s).`
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
};

module.exports = {
  getVapidPublicKey,
  subscribe,
  unsubscribe,
  testNotification
};

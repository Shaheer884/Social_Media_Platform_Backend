const {
  getNotificationPreferences,
  updateNotificationPreferences
} = require('../services/notificationPreferenceService');

// @desc    Get notification preferences
// @route   GET /api/notifications/preferences
// @access  Protected
const getPreferences = async (req, res) => {
  try {
    const preferences = await getNotificationPreferences(req.user.id);
    if (!preferences) {
      return res.status(404).json({ success: false, error: 'User settings not found' });
    }
    res.json({ success: true, data: preferences });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Update notification preferences
// @route   PUT /api/notifications/preferences
// @access  Protected
const updatePreferences = async (req, res) => {
  try {
    const updatedPreferences = await updateNotificationPreferences(req.user.id, req.body);
    res.json({ success: true, data: updatedPreferences, message: 'Notification Preferences Updated Successfully' });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
  getPreferences,
  updatePreferences
};

const PlatformSettings = require('../models/PlatformSettings');

const getSettings = async () => {
  try {
    let settings = await PlatformSettings.findOne();
    if (!settings) {
      settings = await PlatformSettings.create({});
    }
    return settings;
  } catch (error) {
    console.error('Error fetching platform settings:', error);
    // Return standard defaults if db fails
    return {
      platformName: 'ConnectHub',
      platformLogo: '',
      maintenanceMode: false,
      allowRegistration: true,
      requireEmailVerification: true,
      maxImageSize: 5 * 1024 * 1024,
      maxVideoSize: 20 * 1024 * 1024,
      allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      allowedVideoTypes: ['video/mp4', 'video/mpeg', 'video/ogg', 'video/webm', 'video/quicktime'],
      defaultProfileImage: '/uploads/default-avatar.png'
    };
  }
};

module.exports = { getSettings };

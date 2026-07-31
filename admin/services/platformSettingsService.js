const PlatformSettings = require('../models/PlatformSettings');

const getSettings = async () => {
  let settings = await PlatformSettings.findOne();
  if (!settings) {
    settings = await PlatformSettings.create({});
  }
  return settings;
};

const updateSettings = async (updateData) => {
  let settings = await PlatformSettings.findOne();
  if (!settings) {
    settings = new PlatformSettings();
  }

  // Update properties
  if (updateData.platformName !== undefined) settings.platformName = updateData.platformName;
  if (updateData.platformLogo !== undefined) settings.platformLogo = updateData.platformLogo;
  if (updateData.maintenanceMode !== undefined) settings.maintenanceMode = updateData.maintenanceMode;
  if (updateData.allowRegistration !== undefined) settings.allowRegistration = updateData.allowRegistration;
  if (updateData.requireEmailVerification !== undefined) settings.requireEmailVerification = updateData.requireEmailVerification;
  if (updateData.maxImageSize !== undefined) settings.maxImageSize = updateData.maxImageSize;
  if (updateData.maxVideoSize !== undefined) settings.maxVideoSize = updateData.maxVideoSize;
  if (updateData.allowedImageTypes !== undefined) settings.allowedImageTypes = updateData.allowedImageTypes;
  if (updateData.allowedVideoTypes !== undefined) settings.allowedVideoTypes = updateData.allowedVideoTypes;
  if (updateData.defaultProfileImage !== undefined) settings.defaultProfileImage = updateData.defaultProfileImage;

  await settings.save();
  return settings;
};

module.exports = {
  getSettings,
  updateSettings
};

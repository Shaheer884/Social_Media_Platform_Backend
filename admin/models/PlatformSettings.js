const mongoose = require('mongoose');

const PlatformSettingsSchema = new mongoose.Schema({
  platformName: {
    type: String,
    default: 'ConnectHub'
  },
  platformLogo: {
    type: String,
    default: ''
  },
  maintenanceMode: {
    type: Boolean,
    default: false
  },
  allowRegistration: {
    type: Boolean,
    default: true
  },
  requireEmailVerification: {
    type: Boolean,
    default: true
  },
  maxImageSize: {
    type: Number,
    default: 5 * 1024 * 1024 // 5MB in bytes
  },
  maxVideoSize: {
    type: Number,
    default: 30 * 1024 * 1024 // 30MB in bytes
  },
  allowedImageTypes: {
    type: [String],
    default: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  },
  allowedVideoTypes: {
    type: [String],
    default: ['video/mp4', 'video/mpeg', 'video/ogg', 'video/webm', 'video/quicktime']
  },
  defaultProfileImage: {
    type: String,
    default: '/uploads/default-avatar.png'
  }
}, { timestamps: true });

module.exports = mongoose.model('PlatformSettings', PlatformSettingsSchema);

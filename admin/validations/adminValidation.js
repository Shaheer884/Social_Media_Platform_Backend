const { check, validationResult } = require('express-validator');

const validateSettings = [
  check('platformName', 'Platform Name must not be empty').optional().trim().notEmpty(),
  check('maxImageSize', 'Image size must be a valid number').optional().isNumeric(),
  check('maxVideoSize', 'Video size must be a valid number').optional().isNumeric(),
  check('maintenanceMode', 'Maintenance mode must be a boolean').optional().isBoolean(),
  check('allowRegistration', 'Allow registration must be a boolean').optional().isBoolean(),
  check('requireEmailVerification', 'Require email verification must be a boolean').optional().isBoolean(),
  check('adminTheme', 'Admin Theme must be a valid string').optional().trim().notEmpty(),
];

const validateBroadcast = [
  check('title', 'Announcement title is required').trim().notEmpty(),
  check('message', 'Announcement message is required').trim().notEmpty(),
  check('type', 'Announcement type must be a valid option').isIn(['Platform Updates', 'Maintenance Notice', 'Security Alerts', 'Feature Release'])
];

const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMsg = errors.array().map(e => e.msg).join(', ');
    return res.status(400).json({ success: false, error: errorMsg, errors: errors.array() });
  }
  next();
};

module.exports = {
  validateSettings,
  validateBroadcast,
  checkValidation
};

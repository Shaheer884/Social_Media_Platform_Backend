const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  // Check if token exists in Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token, attach to request object
      req.user = await User.findById(decoded.id).select('-passwordHash');
      
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }

      // Check if user is soft deleted
      if (req.user.isDeleted) {
        return res.status(401).json({ success: false, error: 'Your account has been deleted.' });
      }

      // Check if user is suspended
      if (req.user.isSuspended) {
        return res.status(403).json({ success: false, error: 'Your account has been suspended.' });
      }

      // Check rolling session expiry (7 days)
      if (req.user.lastActiveAt) {
        const diffTime = Math.abs(new Date() - new Date(req.user.lastActiveAt));
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        if (diffDays > 7) {
          return res.status(401).json({ success: false, error: 'Session Expired' });
        }
      }

      // Update lastActiveAt to current date/time on activity
      req.user.lastActiveAt = new Date();
      await User.updateOne({ _id: req.user._id }, { $set: { lastActiveAt: req.user.lastActiveAt } });

      // Check maintenance mode
      const PlatformSettings = require('../admin/models/PlatformSettings');
      const settings = await PlatformSettings.findOne();
      if (settings && settings.maintenanceMode && req.user.role !== 'admin') {
        return res.status(503).json({
          success: false,
          error: 'Platform is currently undergoing maintenance. Please try again later.',
          isMaintenance: true
        });
      }

      // Block unverified users from other protected endpoints, but allow verification requests
      if (
        req.user.isVerified === false &&
        !(
          req.baseUrl === '/api/auth' &&
          (req.path === '/verify' || req.path === '/resend-verification')
        )
      ) {
        return res.status(403).json({
          success: false,
          error: 'Account not verified. Please verify your email.',
          requiresVerification: true
        });
      }

      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ success: false, error: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized, no token provided' });
  }
};

const authenticateUser = protect;

module.exports = { protect, authenticateUser };

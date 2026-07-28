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

module.exports = { protect };

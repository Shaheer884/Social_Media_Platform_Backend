const jwt = require('jsonwebtoken');
const User = require('../../models/User');

const authenticateAdmin = async (req, res, next) => {
  let token;

  // Check Authorization header for Bearer token
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await User.findById(decoded.id).select('-passwordHash');
      if (!user) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }

      if (user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Access denied: Admin role required' });
      }

      if (user.isSuspended) {
        return res.status(403).json({ success: false, error: 'Account has been suspended' });
      }

      if (user.isDeleted) {
        return res.status(403).json({ success: false, error: 'Account has been deleted' });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('Admin Auth Error:', error);
      return res.status(401).json({ success: false, error: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized, no token provided' });
  }
};

module.exports = { authenticateAdmin };

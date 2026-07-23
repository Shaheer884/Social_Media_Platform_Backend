const express = require('express');
const { check } = require('express-validator');
const { registerUser, loginUser } = require('../controllers/authController');

const router = express.Router();

router.post(
  '/register',
  [
    check('username', 'Username is required and must be at least 3 characters')
      .trim()
      .isLength({ min: 3 }),
    check('email', 'Please include a valid email')
      .isEmail()
      .normalizeEmail(),
    check('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters')
      .custom((value) => {
        const hasUppercase = /[A-Z]/.test(value);
        const hasLowercase = /[a-z]/.test(value);
        const hasNumber = /[0-9]/.test(value);
        const hasSpecial = /[\W_]/.test(value);
        if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
          throw new Error('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
        }
        return true;
      }),
    check('fullName', 'Full name is required')
      .trim()
      .not()
      .isEmpty()
  ],
  registerUser
);

router.post(
  '/login',
  [
    check('emailOrUsername', 'Email or username is required').trim().not().isEmpty(),
    check('password', 'Password is required').exists()
  ],
  loginUser
);

module.exports = router;

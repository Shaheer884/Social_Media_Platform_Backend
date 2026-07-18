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
    check('password', 'Please enter a password with 6 or more characters')
      .isLength({ min: 6 }),
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

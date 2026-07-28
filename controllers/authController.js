const { validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMsg = errors.array().map(e => e.msg).join(', ');
    return res.status(400).json({ success: false, error: errorMsg, errors: errors.array() });
  }

  const { username, email, password, fullName } = req.body;

  try {
    // Check if username already exists
    const usernameExists = await User.findOne({ username: username.toLowerCase() });
    if (usernameExists) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username is already taken' 
      });
    }

    // Check if email already exists
    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email is already registered' 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    // Create user
    const user = await User.create({
      username,
      email,
      passwordHash,
      fullName,
      isVerified: false,
      verificationCode,
      verificationCodeExpires
    });

    if (user) {
      // Send verification email
      const sendEmail = require('../utils/sendEmail');
      await sendEmail({
        to: user.email,
        subject: 'Verify Your ConnectHub Email Address',
        text: `Welcome to ConnectHub! Your 6-digit verification code is: ${verificationCode}. It is valid for 1 hour.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #8b5cf6; text-align: center;">Welcome to ConnectHub</h2>
            <p>Hi ${user.fullName},</p>
            <p>Thank you for signing up. Please use the following 6-digit verification code to verify your account and start using the platform:</p>
            <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; margin: 30px 0; padding: 15px; background-color: #f1f5f9; border-radius: 6px; color: #0f172a;">
              ${verificationCode}
            </div>
            <p style="color: #64748b; font-size: 0.875rem;">This code will expire in 1 hour.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="color: #94a3b8; font-size: 0.75rem; text-align: center;">If you did not request this, you can safely ignore this email.</p>
          </div>
        `
      });

      res.status(201).json({
        success: true,
        data: {
          _id: user._id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          profilePicture: user.profilePicture,
          coverPhoto: user.coverPhoto,
          isVerified: user.isVerified,
          token: generateToken(user._id)
        }
      });
    } else {
      res.status(400).json({ success: false, error: 'Invalid user data' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMsg = errors.array().map(e => e.msg).join(', ');
    return res.status(400).json({ success: false, error: errorMsg, errors: errors.array() });
  }

  const { emailOrUsername, password } = req.body;

  try {
    // Check for email or username
    const user = await User.findOne({
      $or: [
        { email: emailOrUsername.toLowerCase() },
        { username: emailOrUsername.toLowerCase() }
      ]
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Email or username does not exist' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Incorrect password' });
    }

    res.json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
        coverPhoto: user.coverPhoto,
        isVerified: user.isVerified,
        token: generateToken(user._id)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Verify email using 6-digit code
// @route   POST /api/auth/verify
// @access  Private (Authenticated)
const verifyEmail = async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, error: 'Please enter verification code' });
  }

  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, error: 'Account is already verified' });
    }

    if (user.verificationCode !== code) {
      return res.status(400).json({ success: false, error: 'Invalid verification code' });
    }

    if (new Date(user.verificationCodeExpires) < new Date()) {
      return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new one.' });
    }

    user.isVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpires = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
        coverPhoto: user.coverPhoto,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Private (Authenticated)
const resendVerificationCode = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, error: 'Account is already verified' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    user.verificationCode = verificationCode;
    user.verificationCodeExpires = verificationCodeExpires;
    await user.save();

    // Send email helper
    const sendEmail = require('../utils/sendEmail');
    await sendEmail({
      to: user.email,
      subject: 'Verify Your ConnectHub Email Address',
      text: `Welcome to ConnectHub! Your 6-digit verification code is: ${verificationCode}. It is valid for 1 hour.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #8b5cf6; text-align: center;">Welcome to ConnectHub</h2>
          <p>Hi ${user.fullName},</p>
          <p>Thank you for signing up. Please use the following 6-digit verification code to verify your account and start using the platform:</p>
          <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; margin: 30px 0; padding: 15px; background-color: #f1f5f9; border-radius: 6px; color: #0f172a;">
            ${verificationCode}
          </div>
          <p style="color: #64748b; font-size: 0.875rem;">This code will expire in 1 hour.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #94a3b8; font-size: 0.75rem; text-align: center;">If you did not request this, you can safely ignore this email.</p>
        </div>
      `
    });

    res.status(200).json({
      success: true,
      message: 'Verification code resent successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  verifyEmail,
  resendVerificationCode
};

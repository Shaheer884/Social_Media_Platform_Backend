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
    const PlatformSettings = require('../admin/models/PlatformSettings');
    const settings = await PlatformSettings.findOne();
    if (settings && !settings.allowRegistration) {
      return res.status(400).json({ success: false, error: 'Registration is currently disabled by the administrator.' });
    }

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

    const requireVerification = settings ? settings.requireEmailVerification : true;

    // Create user
    const user = await User.create({
      username,
      email,
      passwordHash,
      fullName,
      role: 'user', // strictly register as regular user
      isVerified: !requireVerification,
      verificationCode: requireVerification ? verificationCode : null,
      verificationCodeExpires: requireVerification ? verificationCodeExpires : null,
      lastActiveAt: new Date()
    });

    if (user) {
      if (requireVerification) {
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
      }

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
    // Check maintenance mode (only allow admins)
    const PlatformSettings = require('../admin/models/PlatformSettings');
    const settings = await PlatformSettings.findOne();
    if (settings && settings.maintenanceMode) {
      const checkUser = await User.findOne({
        $or: [
          { email: emailOrUsername.toLowerCase() },
          { username: emailOrUsername.toLowerCase() }
        ]
      });
      if (!checkUser || checkUser.role !== 'admin') {
        return res.status(503).json({
          success: false,
          error: 'Platform is currently undergoing maintenance. Please try again later.',
          isMaintenance: true
        });
      }
    }

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

    // Block deleted accounts
    if (user.isDeleted) {
      return res.status(401).json({ success: false, error: 'Your account has been deleted.' });
    }

    // Block suspended accounts
    if (user.isSuspended) {
      return res.status(403).json({ success: false, error: 'Your account has been suspended.' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Incorrect password' });
    }

    // Update last login date
    user.lastLogin = new Date();
    user.lastActiveAt = new Date();
    await user.save();

    // Log login activity
    try {
      const activityLogService = require('../admin/services/activityLogService');
      await activityLogService.logAction({
        adminId: user._id,
        adminName: user.fullName || user.username,
        action: user.role === 'admin' ? 'Admin Login' : 'User Login',
        target: user.role === 'admin' ? 'Admin Panel' : 'Platform',
        ipAddress: req.ip
      });
    } catch (logError) {
      console.error('Failed to log login action in activity logs:', logError);
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
        role: user.role, // pass role to client
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

// @desc    Forgot password - generate & send OTP
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Please enter your email' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });

    // Security: Do not expose whether the email exists
    const genericResponse = {
      success: true,
      message: 'If this email is registered, a password reset code has been sent.'
    };

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // Generate random 6-digit OTP
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    user.resetPasswordCode = resetCode;
    user.resetPasswordExpires = resetExpires;
    user.resetPasswordAttempts = 0;
    user.resetPasswordVerified = false;
    await user.save();

    // Send email helper
    const sendEmail = require('../utils/sendEmail');
    await sendEmail({
      to: user.email,
      subject: 'ConnectHub Password Reset Code',
      text: `Hello ${user.fullName},\n\nYou requested a password reset. Your 6-digit verification code is: ${resetCode}.\n\nThis code is valid for 10 minutes. For security reasons, please DO NOT share this code with anyone.\n\nIf you did not request this, please ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #8b5cf6; text-align: center;">Reset Your ConnectHub Password</h2>
          <p>Hello <strong>${user.fullName}</strong>,</p>
          <p>You requested a password reset. Please use the following 6-digit verification code to verify your request and reset your password:</p>
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; margin: 30px 0; padding: 15px; background-color: #f1f5f9; border-radius: 6px; color: #0f172a;">
            ${resetCode}
          </div>
          <p style="color: #ef4444; font-weight: 600; text-align: center;">This code will expire in 10 minutes.</p>
          <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px;">
            <p style="color: #b45309; margin: 0; font-size: 0.875rem;"><strong>Security Warning:</strong> For security reasons, do NOT share this verification code with anyone, including ConnectHub staff.</p>
          </div>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #94a3b8; font-size: 0.75rem; text-align: center;">If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
        </div>
      `
    });

    res.status(200).json(genericResponse);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Verify OTP for password reset
// @route   POST /api/auth/verify-reset-code
// @access  Public
const verifyResetCode = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ success: false, error: 'Please enter email and verification code' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid email or code' });
    }

    // Limit to 5 incorrect OTP attempts
    if (user.resetPasswordAttempts >= 5) {
      return res.status(400).json({ success: false, error: 'Maximum OTP attempts exceeded. Please request a new code.' });
    }

    // Check expiration
    if (new Date(user.resetPasswordExpires) < new Date()) {
      return res.status(400).json({ success: false, error: 'Reset code has expired. Please request a new one.' });
    }

    // Check match
    if (user.resetPasswordCode !== code) {
      user.resetPasswordAttempts += 1;
      await user.save();
      return res.status(400).json({ success: false, error: 'Incorrect verification code.' });
    }

    // Mark as verified
    user.resetPasswordVerified = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Code verified successfully.'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Resend password reset OTP
// @route   POST /api/auth/resend-reset-code
// @access  Public
const resendResetCode = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Please enter your email' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });

    const genericResponse = {
      success: true,
      message: 'If this email is registered, a new password reset code has been sent.'
    };

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // Generate new random 6-digit OTP
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Save and overwrite the old OTP
    user.resetPasswordCode = resetCode;
    user.resetPasswordExpires = resetExpires;
    user.resetPasswordAttempts = 0;
    user.resetPasswordVerified = false;
    await user.save();

    // Send email helper
    const sendEmail = require('../utils/sendEmail');
    await sendEmail({
      to: user.email,
      subject: 'ConnectHub Password Reset Code',
      text: `Hello ${user.fullName},\n\nYou requested a password reset. Your 6-digit verification code is: ${resetCode}.\n\nThis code is valid for 10 minutes. For security reasons, please DO NOT share this code with anyone.\n\nIf you did not request this, please ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #8b5cf6; text-align: center;">Reset Your ConnectHub Password</h2>
          <p>Hello <strong>${user.fullName}</strong>,</p>
          <p>You requested a password reset. Please use the following 6-digit verification code to verify your request and reset your password:</p>
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; margin: 30px 0; padding: 15px; background-color: #f1f5f9; border-radius: 6px; color: #0f172a;">
            ${resetCode}
          </div>
          <p style="color: #ef4444; font-weight: 600; text-align: center;">This code will expire in 10 minutes.</p>
          <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px;">
            <p style="color: #b45309; margin: 0; font-size: 0.875rem;"><strong>Security Warning:</strong> For security reasons, do NOT share this verification code with anyone, including ConnectHub staff.</p>
          </div>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #94a3b8; font-size: 0.75rem; text-align: center;">If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
        </div>
      `
    });

    res.status(200).json(genericResponse);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  const { email, password, confirmPassword } = req.body;

  if (!email || !password || !confirmPassword) {
    return res.status(400).json({ success: false, error: 'All fields are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, error: 'Passwords do not match' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(400).json({ success: false, error: 'User not found' });
    }

    // Verify OTP was successfully checked and has not expired
    if (!user.resetPasswordVerified) {
      return res.status(401).json({ success: false, error: 'Unauthorized. Please verify your OTP code first.' });
    }

    if (new Date(user.resetPasswordExpires) < new Date()) {
      return res.status(400).json({ success: false, error: 'Reset session expired. Please request a new code.' });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    user.passwordHash = passwordHash;
    // Clear reset credentials
    user.resetPasswordCode = null;
    user.resetPasswordExpires = null;
    user.resetPasswordAttempts = 0;
    user.resetPasswordVerified = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successful.'
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
  resendVerificationCode,
  forgotPassword,
  verifyResetCode,
  resendResetCode,
  resetPassword
};

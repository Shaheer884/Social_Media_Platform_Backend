const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Please add a username'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Username must be at least 3 characters']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  passwordHash: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  fullName: {
    type: String,
    required: [true, 'Please add a full name'],
    trim: true
  },
  birthday: {
    type: Date
  },
  birthdayPrivacy: {
    type: String,
    enum: ['Public', 'Friends Only', 'Only Me'],
    default: 'Public'
  },
  bio: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    default: ''
  },
  profilePicture: {
    type: String,
    default: '/uploads/default-avatar.png'
  },
  coverPhoto: {
    type: String,
    default: '/uploads/default-cover.png'
  },
  followers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ],
  following: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ],
  savedPosts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post'
    }
  ],
  profilePicturePublicId: {
    type: String,
    default: ''
  },
  coverPhotoPublicId: {
    type: String,
    default: ''
  },
  isVerified: {
    type: Boolean,
    default: true
  },
  verificationCode: {
    type: String,
    default: null
  },
  verificationCodeExpires: {
    type: Date,
    default: null
  },
  resetPasswordCode: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  resetPasswordAttempts: {
    type: Number,
    default: 0
  },
  resetPasswordVerified: {
    type: Boolean,
    default: false
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  phone: {
    type: String,
    default: ''
  },
  website: {
    type: String,
    default: ''
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other', 'Prefer not to say', ''],
    default: ''
  },
  theme: {
    type: String,
    enum: ['light', 'dark', 'system'],
    default: 'system'
  },
  notificationPreferences: {
    likes: { type: Boolean, default: true },
    comments: { type: Boolean, default: true },
    replies: { type: Boolean, default: true },
    friendRequests: { type: Boolean, default: true },
    followers: { type: Boolean, default: true },
    mentions: { type: Boolean, default: true },
    birthdayReminders: { type: Boolean, default: true },
    adminAnnouncements: { type: Boolean, default: true },
    storyNotifications: { type: Boolean, default: true },
    postNotifications: { type: Boolean, default: true }
  },
  notificationSettings: {
    likes: { type: Boolean, default: true },
    comments: { type: Boolean, default: true },
    commentReplies: { type: Boolean, default: true },
    storyLikes: { type: Boolean, default: true },
    storyReplies: { type: Boolean, default: true },
    storyMentions: { type: Boolean, default: true },
    postMentions: { type: Boolean, default: true },
    tags: { type: Boolean, default: true },
    followers: { type: Boolean, default: true },
    friendRequests: { type: Boolean, default: true },
    friendRequestAccepted: { type: Boolean, default: true },
    messages: { type: Boolean, default: true },
    birthdayReminders: { type: Boolean, default: true },
    birthdayWishes: { type: Boolean, default: true },
    loginStreakReminder: { type: Boolean, default: true },
    friendStreakReminder: { type: Boolean, default: true },
    adminAnnouncements: { type: Boolean, default: true },
    platformUpdates: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: false }
  },
  commentSettings: {
    whoCanComment: {
      type: String,
      enum: ['Everyone', 'Followers', 'Friends', 'Only Me'],
      default: 'Everyone'
    },
    allowEmoji: { type: Boolean, default: true },
    allowGif: { type: Boolean, default: true },
    filterOffensive: { type: Boolean, default: false },
    hideSpam: { type: Boolean, default: false },
    autoModerate: { type: Boolean, default: false }
  },
  blockedUsers: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      blockedAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  followRequests: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ],
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isSuspended: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  lastLogin: {
    type: Date,
    default: null
  },
  lastActiveAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

module.exports = mongoose.model('User', UserSchema);

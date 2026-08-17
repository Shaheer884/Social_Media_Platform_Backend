const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'like', 'comment', 'follow', 'story-like', 'story-comment', 
      'birthday', 'birthday-wish', 'birthday-gift', 'announcement', 
      'mention', 'story-reply', 'story-mention', 'friend-request', 
      'friend-accept', 'security', 'password-changed', 'chat'
    ],
    required: true
  },
  message: {
    type: String,
    default: ''
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  },
  story: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story'
  },
  comment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  },
  read: {
    type: Boolean,
    default: false
  },
  isRead: {
    type: Boolean,
    default: false
  },
  deletedByUser: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  readAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Performance optimization indexes
NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, deletedByUser: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, isRead: 1, deletedByUser: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);


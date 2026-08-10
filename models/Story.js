const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      default: '',
      maxlength: [100, 'Story text cannot be more than 100 characters']
    },
    imageUrl: {
      type: String,
      default: ''
    },
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      default: 'image'
    },
    cloudinaryPublicId: {
      type: String,
      default: ''
    },
    media: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        resourceType: { type: String, required: true },
        format: { type: String },
        width: { type: Number },
        height: { type: Number },
        duration: { type: Number },
        size: { type: Number }
      }
    ],
    backgroundColor: {
      type: String,
      default: 'linear-gradient(135deg, #8b5cf6, #ec4899)'
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        text: {
          type: String,
          required: true,
          maxlength: [200, 'Comment cannot be more than 200 characters']
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    views: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        viewedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    privacy: {
      type: String,
      enum: ['public', 'friends', 'followers', 'me', 'custom', 'hide'],
      default: 'public'
    },
    allowedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    hiddenUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    storyReplies: [
      {
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        receiver: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        message: {
          type: String,
          required: true
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Story', StorySchema);

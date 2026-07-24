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
    ]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Story', StorySchema);

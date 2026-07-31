const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      default: '',
      maxlength: [280, 'Post content cannot be more than 280 characters']
    },
    imageUrl: {
      type: String,
      default: ''
    },
    mediaUrl: {
      type: String,
      default: ''
    },
    mediaType: {
      type: String,
      enum: ['image', 'video', 'none'],
      default: 'none'
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
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date,
      default: null
    },
    isHidden: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Post', PostSchema);

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
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Story', StorySchema);

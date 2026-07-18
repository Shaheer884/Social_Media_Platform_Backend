const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  data: {
    type: Buffer,
    required: true
  },
  contentType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add an index to speed up retrieval and queries
ImageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Image', ImageSchema);

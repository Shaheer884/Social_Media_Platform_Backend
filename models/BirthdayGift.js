const mongoose = require('mongoose');

const BirthdayGiftSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  giftType: {
    type: String,
    enum: ['Cake', 'Gift Box', 'Flowers', 'Balloons', 'Chocolate', 'Coffee'],
    required: true
  },
  message: {
    type: String,
    default: ''
  },
  birthdayYear: {
    type: Number,
    required: true,
    default: () => new Date().getFullYear()
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('BirthdayGift', BirthdayGiftSchema);

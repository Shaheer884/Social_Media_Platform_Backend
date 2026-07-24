const multer = require('multer');
const path = require('path');

// Configure memory storage instead of saving files to disk
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|webp|gif|mp4|mov|avi|mkv|webm/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Images and Videos only!'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

module.exports = upload;

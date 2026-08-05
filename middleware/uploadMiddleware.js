const multer = require('multer');
const path = require('path');

// Configure memory storage instead of saving files to disk
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|webp|mp4|mov|webm/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only JPEG, JPG, PNG, WEBP images and MP4, MOV, WEBM videos are allowed!'));
    }
  },
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit
});

module.exports = upload;

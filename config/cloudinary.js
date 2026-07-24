const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a file buffer directly to Cloudinary via stream.
 * @param {Buffer} fileBuffer - File buffer from Multer memory storage.
 * @param {string} folder - Destination folder on Cloudinary.
 * @param {string} resourceType - Resource type ('image', 'video', 'auto').
 * @returns {Promise<object>} Upload result object from Cloudinary.
 */
const uploadStream = (fileBuffer, folder = 'connecthub', resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: resourceType
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

module.exports = {
  cloudinary,
  uploadStream
};

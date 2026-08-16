const { cloudinary } = require('../config/cloudinary');

/**
 * Generates a secure upload signature for Cloudinary direct upload.
 * 
 * @route   GET /api/uploads/signature
 * @access  Protected (User)
 */
const getUploadSignature = async (req, res) => {
  try {
    const { folder, resourceType } = req.query;

    if (!folder) {
      return res.status(400).json({ success: false, error: 'Destination folder is required' });
    }

    // Security: Validate the destination folder to prevent arbitrary uploads
    const allowedFolders = [
      'connecthub/posts/images',
      'connecthub/posts/videos',
      'connecthub/stories/images',
      'connecthub/stories/videos',
      'connecthub/profiles/avatars',
      'connecthub/profiles/covers',
      'connecthub/chats'
    ];

    if (!allowedFolders.includes(folder)) {
      return res.status(400).json({ success: false, error: 'Invalid destination folder' });
    }

    const timestamp = Math.round(new Date().getTime() / 1000);
    
    // Generate signature using Cloudinary SDK utility
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        folder
      },
      process.env.CLOUDINARY_API_SECRET
    );

    res.json({
      success: true,
      signature,
      timestamp,
      folder,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME
    });
  } catch (error) {
    console.error('Error generating upload signature:', error);
    res.status(500).json({ success: false, error: 'Failed to generate upload signature' });
  }
};

/**
 * Destroys a specified asset from Cloudinary.
 * Used during client upload cancellations or failed db transactions.
 * 
 * @route   POST /api/uploads/cleanup
 * @access  Protected (User)
 */
const cleanupMedia = async (req, res) => {
  try {
    const { publicId, resourceType } = req.body;

    if (!publicId) {
      return res.status(400).json({ success: false, error: 'publicId is required' });
    }

    // Destroy asset on Cloudinary
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType || 'image'
    });

    res.json({
      success: true,
      message: 'Media cleaned up successfully',
      result
    });
  } catch (error) {
    console.error('Error cleaning up media from Cloudinary:', error);
    res.status(500).json({ success: false, error: 'Server error cleaning up media' });
  }
};

module.exports = {
  getUploadSignature,
  cleanupMedia
};

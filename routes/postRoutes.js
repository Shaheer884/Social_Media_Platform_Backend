const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getPostFeed,
  createPost,
  getPostById,
  updatePost,
  deletePost,
  likePost,
  unlikePost,
  getUserPosts,
  savePost,
  unsavePost,
  getSavedPosts
} = require('../controllers/postController');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

// Post routes
router.get('/', protect, getPostFeed);
router.post('/', protect, upload.single('postImage'), createPost);
router.get('/saved', protect, getSavedPosts);
router.get('/user/:userId', protect, getUserPosts);
router.get('/:id', protect, getPostById);
router.put('/:id', protect, upload.single('postImage'), updatePost);
router.delete('/:id', protect, deletePost);

// Like routes
router.post('/:id/like', protect, likePost);
router.delete('/:id/like', protect, unlikePost);

// Save routes
router.post('/:id/save', protect, savePost);
router.delete('/:id/save', protect, unsavePost);

// Comment routes (nested under posts)
const { getPostComments, createComment } = require('../controllers/commentController');
router.get('/:id/comments', protect, getPostComments);
router.post('/:id/comments', protect, createComment);

module.exports = router;

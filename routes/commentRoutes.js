const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { deleteComment } = require('../controllers/commentController');

const router = express.Router();

router.delete('/:id', protect, deleteComment);

module.exports = router;

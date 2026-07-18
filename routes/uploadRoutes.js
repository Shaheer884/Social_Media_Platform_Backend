const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');

// Dynamic SVG default avatar placeholder
const DEFAULT_AVATAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="150" height="150">
  <rect width="100%" height="100%" fill="#E2E8F0"/>
  <circle cx="12" cy="8" r="4" fill="#94A3B8"/>
  <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="#94A3B8"/>
</svg>
`.trim();

// Dynamic SVG default cover placeholder
const DEFAULT_COVER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300" width="800" height="300">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3B82F6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#8B5CF6;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#grad)"/>
</svg>
`.trim();

// Use /tmp for uploads on Vercel, otherwise local directory
const uploadDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'uploads')
  : path.join(__dirname, '../uploads');

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Handle default fallbacks
    if (id === 'default-avatar.png') {
      res.set('Content-Type', 'image/svg+xml');
      return res.send(DEFAULT_AVATAR_SVG);
    }
    if (id === 'default-cover.png') {
      res.set('Content-Type', 'image/svg+xml');
      return res.send(DEFAULT_COVER_SVG);
    }

    const filePath = path.join(uploadDir, id);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Error retrieving media:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;

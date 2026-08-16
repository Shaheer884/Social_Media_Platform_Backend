const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

// Connect to Database
const seedAdmin = require('./admin/utils/seedAdmin');
connectDB().then(() => {
  seedAdmin();
});

const app = express();

// Enable CORS as the very first middleware to handle preflight requests properly
app.use(cors());

// Security Middlewares
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(mongoSanitize());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests from this IP, please try again after 15 minutes' }
});
app.use('/api', limiter);

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Route for database uploads and Cloudinary upload signing/cleanup
const uploadRoutes = require('./routes/uploadRoutes');
app.use('/uploads', uploadRoutes);
app.use('/api/uploads', uploadRoutes);

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const commentRoutes = require('./routes/commentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const storyRoutes = require('./routes/storyRoutes');
const birthdayRoutes = require('./routes/birthdayRoutes');
const settingsRoutes = require('./settings/routes/settingsRoutes');
const { startBirthdayChecker } = require('./utils/birthdayChecker');

// Mount routes
const adminRoutes = require('./admin/routes/adminRoutes');
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/birthday', birthdayRoutes);
app.use('/api/settings', settingsRoutes);

// Start background birthday scheduler
startBirthdayChecker();

// Serve static frontend files if folder exists
const clientPath = path.join(__dirname, '../client');
if (fs.existsSync(clientPath)) {
  app.use(express.static(clientPath));
}

// Fallback route for SPA details or simply redirecting to root
app.get('*', (req, res, next) => {
  // If requesting API, pass to next (error handler)
  if (req.url.startsWith('/api')) {
    return next();
  }
  
  const indexPath = path.join(__dirname, '../client/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ success: true, message: 'ConnectHub Backend API is running' });
  }
});

// Centralized error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  const statusCode = err.status || 500;
  const message = (process.env.NODE_ENV === 'production' && statusCode === 500)
    ? 'Internal Server Error'
    : err.message || 'Server error';

  res.status(statusCode).json({
    success: false,
    error: message
  });
});

const PORT = process.env.PORT || 5000;

// Only listen on a port if not in a serverless/production environment
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

module.exports = app;


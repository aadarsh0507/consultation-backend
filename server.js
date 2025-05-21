const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const fs = require('fs');
const multer = require('multer');
const { Readable } = require('stream');
const User = require('./models/User');
const cloudinary = require('./cloudinaryConfig');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Security middleware
app.use(helmet());
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());
app.use(express.json());

// Allowed origins
const allowedOrigins = [
  'https://consultationapp.netlify.app',
  'http://localhost:3000'
];

// Global CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  next();
});

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiting (skip OPTIONS)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }
  limiter(req, res, next);
});

// Function to get the latest storage path
const getStoragePath = () => {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'storagePath.json'), 'utf-8'));
    return config.path;
  } catch (err) {
    console.error("Error reading storage path file:", err);
    return 'default-folder'; // fallback folder
  }
};

// Update storage path
app.post('/api/update-storage-path', (req, res) => {
  const { newStoragePath } = req.body;

  if (!newStoragePath) {
    return res.status(400).json({ error: 'Storage path is required' });
  }

  try {
    fs.writeFileSync(
      path.join(__dirname, 'storagePath.json'),
      JSON.stringify({ path: newStoragePath }, null, 2)
    );
    res.json({ success: true, message: 'Cloudinary folder updated successfully', folder: newStoragePath });
  } catch (error) {
    res.status(500).json({ error: 'Error saving Cloudinary folder name', details: error.message });
  }
});

// Get current storage path
app.get('/api/get-storage-path', (req, res) => {
  const storagePath = getStoragePath();
  if (!storagePath) {
    return res.status(400).json({ error: 'Storage path not found' });
  }
  res.json({ path: storagePath });
});

// Multer config (in-memory for Cloudinary)
const upload = multer({ storage: multer.memoryStorage() });

// POST request to save the video (using Cloudinary)
app.post('/api/save-video', upload.single('videoFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  const folder = getStoragePath();
  const stream = cloudinary.uploader.upload_stream(
    {
      resource_type: 'video',
      folder: folder
    },
    (error, result) => {
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({
        success: true,
        message: 'Video uploaded successfully to Cloudinary',
        videoUrl: result.secure_url,
        publicId: result.public_id
      });
    }
  );

  Readable.from(req.file.buffer).pipe(stream);
});

// Logger
app.use(morgan('dev'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/consultations', require('./routes/consultations'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// MongoDB connect & server start
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is not defined');
  process.exit(1);
}

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000
    });
    console.log('Connected to MongoDB');

    try {
      await User.createDefaultAdmin();
      console.log('Admin user creation completed');
    } catch (adminError) {
      console.error('Admin user creation error:', adminError);
    }

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Error during server startup:', err);
    process.exit(1);
  }
}

startServer();

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

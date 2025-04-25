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
const multer = require('multer');  // Add multer for file uploads
const User = require('./models/User');

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

// CORS configuration
app.use(cors({
 origin: ['https://consultationapp.netlify.app', 'http://localhost:3000']
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  preflightContinue: true,
  exposedHeaders: ['Content-Range', 'Content-Length', 'Content-Type']
}));

// Rate limiting with more generous limits for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiting to all routes except OPTIONS (preflight)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    next();
  } else {
    limiter(req, res, next);
  }
});

// Function to get the latest storage path from the JSON file
const getStoragePath = () => {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'storagePath.json'), 'utf-8'));
    return config.path;
  } catch (err) {
    console.error("Error reading storage path file:", err);
    return null;
  }
};

// POST request to update the storage path
app.post('/update-storage-path', (req, res) => {
  const { newStoragePath } = req.body;

  if (!newStoragePath) {
    return res.status(400).json({ error: 'Storage path is required' });
  }

  const absolutePath = path.resolve(newStoragePath);

  // Save the new storage path in storagePath.json
  try {
    fs.writeFileSync(path.join(__dirname, 'storagePath.json'), JSON.stringify({ path: absolutePath }, null, 2));

    // Ensure the directory exists
    if (!fs.existsSync(absolutePath)) {
      fs.mkdirSync(absolutePath, { recursive: true });
    }

    res.json({ success: true, message: 'Storage path updated successfully', path: absolutePath });
  } catch (error) {
    res.status(500).json({ error: 'Error saving storage path', details: error.message });
  }
});

// GET request to retrieve the current storage path
app.get('/get-storage-path', (req, res) => {
  const storagePath = getStoragePath();
  if (!storagePath) {
    return res.status(400).json({ error: 'Storage path not found' });
  }
  res.json({ path: storagePath });
});

// Setup multer storage configuration for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const storagePath = getStoragePath();
    if (!storagePath) {
      return cb(new Error('Storage path not set'), false);
    }
    // Ensure the directory exists
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
    cb(null, storagePath); // Destination is the dynamically loaded storage path
  },
  filename: (req, file, cb) => {
    // Set the file name as per your requirement (e.g., original file name or a unique name)
    cb(null, file.originalname);  // Save file with the original name
  }
});

// Initialize multer upload middleware
const upload = multer({ storage: storage });

// POST request to save the video (using the dynamic storage path)
app.post('/save-video', upload.single('videoFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  // Get the file path where the video is saved
  const videoPath = path.join(getStoragePath(), req.file.originalname);

  res.json({ success: true, message: 'Video saved successfully', videoPath });
});

// Middleware for logging requests
app.use(morgan('dev'));

// Serve videos from the dynamic storage path
app.use('/videos', (req, res, next) => {
  const storagePath = getStoragePath();
  if (!storagePath) {
    return res.status(500).json({ error: 'Storage path not configured' });
  }
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://consultationapp.netlify.app');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  
  // Serve static files from the storage path
  express.static(storagePath)(req, res, next);
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/consultations', require('./routes/consultations'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Connect to MongoDB and create admin user
const MONGODB_URI = process.env.MONGODB_URI || 'https://consultation-backend-nmyg.onrender.com';

async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Create default admin user
    await User.createDefaultAdmin();
    console.log('Admin user creation completed');

    // Start server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Error during server startup:', err);
    process.exit(1);
  }
}

// Start the server
startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

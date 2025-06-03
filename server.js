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
const cloudinary = require('./cloudinaryConfig'); // ✅ uses .env
dotenv.config(); // ✅ Load .env first

const app = express();

// Security middleware
app.use(helmet());
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());
app.use(express.json());

// CORS setup
const allowedOrigins = [
  'https://consultation-frontend-5fq9.vercel.app/doctor-login'
  'https://consultationapp.netlify.app',
  'http://localhost:3000'
];
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

// Rate limiter (skip OPTIONS)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  limiter(req, res, next);
});

// ===== Storage Path Config =====
const getStoragePath = () => {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'storagePath.json'), 'utf-8'));
    return config.path || 'default-folder';
  } catch (err) {
    console.error('Error reading storagePath.json:', err.message);
    return 'default-folder';
  }
};

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
    res.status(500).json({ error: 'Error saving Cloudinary folder', details: error.message });
  }
});

app.get('/api/get-storage-path', (req, res) => {
  const path = getStoragePath();
  if (!path) return res.status(400).json({ error: 'Storage path not found' });
  res.json({ path });
});

// ===== Cloudinary Video Upload =====
const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/save-video', upload.single('videoFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  const folder = getStoragePath();
  const stream = cloudinary.uploader.upload_stream(
    {
      resource_type: 'video',
      folder
    },
    (error, result) => {
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.json({
        success: true,
        message: 'Video uploaded successfully to Cloudinary',
        videoUrl: result.secure_url,
        publicId: result.public_id
      });
    }
  );

  Readable.from(req.file.buffer).pipe(stream);
});

// ===== Logging and Routes =====
app.use(morgan('dev'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/consultations', require('./routes/consultations'));

// ===== Global Error Handler =====
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===== MongoDB + Server Startup =====
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined in .env');
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
    console.log('✅ Connected to MongoDB');

    try {
      await User.createDefaultAdmin();
      console.log('✅ Admin user ensured');
    } catch (adminError) {
      console.error('⚠️ Admin creation error:', adminError);
    }

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Server startup error:', err);
    process.exit(1);
  }
}

startServer();

// ===== Exit on unhandled promise rejections =====
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

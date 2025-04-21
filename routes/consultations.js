const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Consultation = require('../models/Consultation');
const { protect, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Load dynamic storage path
const storageConfigPath = path.join(__dirname, '../config/storagePath.json');

const getVideoUploadPath = () => {
  try {
    const config = JSON.parse(fs.readFileSync(storageConfigPath, 'utf-8'));
    return config.path || path.join(__dirname, '../uploads');
  } catch (err) {
    console.error('Could not read storage path config:', err.message);
    return path.join(__dirname, '../uploads');
  }
};

// Configure multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = getVideoUploadPath();
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    file.mimetype.startsWith('video/') ? cb(null, true) : cb(new Error('Not a video file!'), false);
  }
});

// Upload a video
router.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No video file uploaded' });
  }
  res.status(200).json({ success: true, filePath: req.file.path, fileName: req.file.filename });
});

// Create consultation
router.post(
  '/',
  [
    protect,
    authorize('doctor', 'admin'),
    body('patientName').notEmpty().withMessage('Patient name is required'),
    body('doctorName').notEmpty().withMessage('Doctor name is required'),
    body('uhidId').notEmpty().withMessage('UHID is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      console.log('🚀 Consultation request body:', req.body);
      console.log('🔐 Authenticated user:', req.user);

      const consultationData = {
        ...req.body,
        doctor: req.user.id
      };

      const consultation = await Consultation.create(consultationData);
      res.status(201).json(consultation);
    } catch (error) {
      console.error('❌ Error creating consultation:', error);
      if (error.code === 11000) {
        return res.status(400).json({ success: false, message: 'UHID already exists' });
      }
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Get all consultations
router.get('/', protect, async (req, res) => {
  try {
    const {
      dateFrom, dateTo, patientName, doctorName,
      uhidId, page = 1, limit = 10,
      sortField = 'date', sortDirection = 'desc'
    } = req.query;

    const query = {};

    if (dateFrom && dateTo) {
      query.date = {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo)
      };
    }

    if (patientName) query.patientName = { $regex: patientName, $options: 'i' };
    if (doctorName) query.doctorName = { $regex: doctorName, $options: 'i' };
    if (uhidId) query.uhidId = { $regex: uhidId, $options: 'i' };

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const total = await Consultation.countDocuments(query);
    const consultations = await Consultation.find(query)
      .sort({ [sortField]: sortDirection === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      data: {
        consultations,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching consultations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// Doctor-specific consultations
router.get('/doctor', authorize('doctor', 'admin'), async (req, res) => {
  try {
    const consultations = await Consultation.find({ doctor: req.user.id }).sort({ date: -1 });
    res.json({ success: true, count: consultations.length, data: consultations });
  } catch (error) {
    console.error('Error fetching doctor consultations:', error);
    res.status(500).json({ success: false, message: 'Server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// Get consultation by UHID
router.get('/uhid/:uhidId', async (req, res) => {
  try {
    const consultation = await Consultation.findOne({ uhidId: req.params.uhidId }).populate('doctor', 'name email');
    if (!consultation) return res.status(404).json({ success: false, message: 'Consultation not found' });
    res.json({ success: true, data: consultation });
  } catch (error) {
    console.error('Error fetching consultation:', error);
    res.status(500).json({ success: false, message: 'Server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// Update consultation
router.put('/:id', authorize('doctor', 'admin'), async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id);
    if (!consultation) return res.status(404).json({ success: false, message: 'Consultation not found' });

    if (consultation.doctor.toString() !== req.user.id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const updatedConsultation = await Consultation.findByIdAndUpdate(
      req.params.id, { $set: req.body }, { new: true, runValidators: true }
    );

    res.json({ success: true, data: updatedConsultation });
  } catch (error) {
    console.error('Error updating consultation:', error);
    res.status(500).json({ success: false, message: 'Server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// Delete consultation
router.delete('/:id', authorize('doctor', 'admin'), async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id);
    if (!consultation) return res.status(404).json({ success: false, message: 'Consultation not found' });

    if (consultation.doctor.toString() !== req.user.id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    await consultation.remove();
    res.json({ success: true, message: 'Consultation removed' });
  } catch (error) {
    console.error('Error deleting consultation:', error);
    res.status(500).json({ success: false, message: 'Server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

module.exports = router;

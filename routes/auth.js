const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const {protect} = require('../middleware/auth');

// @route   POST api/auth/register
// @desc    Register a doctor or admin
// @access  Public
router.post(
  '/register',
  [
    // Validate required fields
    body('name').notEmpty().withMessage('Name is required'),
    body('doctorId').notEmpty().withMessage('Doctor ID is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    body('role').optional().isIn(['doctor', 'admin']).withMessage('Role must be either doctor or admin'),
  ],
  async (req, res) => {
    // Validate input data
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Registration validation errors:', errors.array());
      return res.status(400).json({
        message: 'Please provide valid input data',
        errors: errors.array(),
      });
    }

    try {
      const { name, doctorId, password, role } = req.body;
      console.log('Registration attempt for:', { name, doctorId, role });

      // Check if user already exists
      let user = await User.findOne({ doctorId });
      if (user) {
        console.log('User already exists:', doctorId);
        return res.status(400).json({ message: 'Doctor ID already exists' });
      }

      // Create new user with plain password
      console.log('Creating new user...');
      user = new User({
        name,
        doctorId,
        password, // The password will be hashed by the pre-save middleware
        role: role || 'doctor'
      });

      // Save user (this will trigger the pre-save middleware to hash the password)
      await user.save();
      console.log('User saved successfully:', user.doctorId);

      // Create token
      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );

      // Remove password from response
      user.password = undefined;

      res.status(201).json({
        success: true,
        token,
        user: {
          id: user._id,
          name: user.name,
          doctorId: user.doctorId,
          role: user.role,
        },
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({
        success: false,
        message: 'Server error during registration',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }
  }
);

// @route   POST api/auth/login
// @desc    Login doctor or admin
// @access  Public
router.post(
  '/login',
  [
    body('doctorId').notEmpty().withMessage('Doctor ID is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    // Validate input data
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Login validation errors:', errors.array());
      return res.status(400).json({
        message: 'Please provide valid credentials',
        errors: errors.array(),
      });
    }

    try {
      const { doctorId, password } = req.body;
      console.log('Login attempt for:', doctorId);

      // Check for predefined admin credentials
      if (doctorId === 'admin' && password === 'admin123') {
        console.log('Admin login successful');
        // Create admin user object
        const adminUser = {
          id: 'admin',
          name: 'Admin',
          doctorId: 'admin',
          role: 'admin'
        };

        // Create token
        const token = jwt.sign(
          { id: adminUser.id, role: adminUser.role },
          process.env.JWT_SECRET,
          { expiresIn: '1d' }
        );

        return res.json({
          success: true,
          token,
          user: adminUser
        });
      }

      // For non-admin users, check database
      console.log('Looking up user in database...');
      const user = await User.findOne({ doctorId }).select('+password');
      console.log('User found:', user ? 'Yes' : 'No');
      
      if (!user) {
        console.log('User not found:', doctorId);
        return res.status(400).json({ message: 'Invalid credentials - Doctor ID does not exist' });
      }

      // Check password
      console.log('Checking password for user:', user.doctorId);
      console.log('User details:', {
        id: user._id,
        doctorId: user.doctorId,
        role: user.role,
        hasPassword: !!user.password
      });
      
      const isMatch = await user.comparePassword(password);
      console.log('Password match:', isMatch);

      if (!isMatch) {
        console.log('Password mismatch for:', doctorId);
        return res.status(400).json({ message: 'Invalid credentials - Incorrect password' });
      }

      // Create token
      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
      );

      // Remove password from user object
      user.password = undefined;

      console.log('Login successful for:', doctorId, 'Role:', user.role);

      res.json({
        success: true,
        token,
        user: {
          id: user._id,
          name: user.name,
          doctorId: user.doctorId,
          role: user.role,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({
        success: false,
        message: 'Server error during login',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }
  }
);

// @route   POST api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', protect, (req, res) => {
  // Invalidate the token or perform any necessary logout operations
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;

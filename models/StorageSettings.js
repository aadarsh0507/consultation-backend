const mongoose = require('mongoose');

const storageSettingsSchema = new mongoose.Schema({
  path: {
    type: String,
    required: [true, 'Storage path is required'],
    trim: true
  },
  maxSize: {
    type: Number,
    default: 1024 // in MB
  },
  allowedTypes: {
    type: [String],
    default: ['webm', 'mp4']
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create a single document for settings
storageSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      path: 'E:/React/videos', // Default path
      maxSize: 1024,
      allowedTypes: ['webm', 'mp4']
    });
  }
  return settings;
};

module.exports = mongoose.model('StorageSettings', storageSettingsSchema); 
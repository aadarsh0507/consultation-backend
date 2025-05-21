// cloudinaryConfig.js
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dxobt9i0k',
  api_key: '519946324988973',
  api_secret: '9wII03Nsu0DwTuRO9Q2WmykolJ8',
});
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
module.exports = cloudinary;

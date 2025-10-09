import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure public folder exists for logo/favicon
const publicDir = path.join(__dirname, '../../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, 'logo-' + uniqueSuffix + extension);
  }
});

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP)'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Configure multer for logo/favicon upload to public folder
const logoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, publicDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const prefix = req.url.includes('logo') ? 'logo' : 'favicon';
    cb(null, `${prefix}-${uniqueSuffix}${extension}`);
  }
});

const logoUpload = multer({ 
  storage: logoStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Upload logo endpoint
router.post('/logo', logoUpload.single('file'), async (req, res) => {
  try {
    console.log('Logo upload request received');
    console.log('File:', req.file);
    
    if (!req.file) {
      console.log('No file provided in request');
      return res.status(400).json({
        success: false,
        message: 'No logo file provided'
      });
    }

    // Construct URL for the uploaded file
    const protocol = req.protocol;
    const host = req.get('host') || 'localhost:4000';
    const fileUrl = `${protocol}://${host}/${req.file.filename}`;
    
    // Update database with new logo path
    try {
      await pool.execute(
        `UPDATE app_settings SET logo = ? WHERE id = 1`,
        [fileUrl]
      );
      console.log('Logo path updated in database:', fileUrl);
    } catch (dbError) {
      console.error('Database update error:', dbError);
      // Continue anyway, file is uploaded
    }
    
    console.log('Logo uploaded successfully:', fileUrl);
    
    res.json({
      success: true,
      data: {
        filename: req.file.filename,
        url: fileUrl
      }
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading logo: ' + error.message
    });
  }
});

// Upload favicon endpoint
router.post('/favicon', logoUpload.single('file'), async (req, res) => {
  try {
    console.log('Favicon upload request received');
    console.log('File:', req.file);
    
    if (!req.file) {
      console.log('No file provided in request');
      return res.status(400).json({
        success: false,
        message: 'No favicon file provided'
      });
    }

    // Construct URL for the uploaded file
    const protocol = req.protocol;
    const host = req.get('host') || 'localhost:4000';
    const fileUrl = `${protocol}://${host}/${req.file.filename}`;
    
    // Also create a copy as favicon.ico for browser fallback
    const faviconPath = path.join(__dirname, '../../public/favicon.ico');
    try {
      // Copy the uploaded file to favicon.ico
      fs.copyFileSync(req.file.path, faviconPath);
      console.log('Favicon also saved as favicon.ico for browser fallback');
    } catch (copyError) {
      console.error('Error creating favicon.ico copy:', copyError);
      // Continue anyway, main upload still works
    }
    
    // Update database with new favicon path
    try {
      await pool.execute(
        `UPDATE app_settings SET favicon = ? WHERE id = 1`,
        [fileUrl]
      );
      console.log('Favicon path updated in database:', fileUrl);
    } catch (dbError) {
      console.error('Database update error:', dbError);
      // Continue anyway, file is uploaded
    }
    
    console.log('Favicon uploaded successfully:', fileUrl);
    
    res.json({
      success: true,
      data: {
        filename: req.file.filename,
        url: fileUrl
      }
    });
  } catch (error) {
    console.error('Error uploading favicon:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading favicon: ' + error.message
    });
  }
});

// Upload image endpoint for SurveyJS Creator
router.post('/image', upload.single('file'), (req, res) => {
  try {
    console.log('Image upload request received');
    console.log('File:', req.file);
    
    if (!req.file) {
      console.log('No file provided in request');
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // SurveyJS Creator expects the response in a specific format
    // Construct URL dynamically based on request
    const protocol = req.protocol;
    const host = req.get('host') || 'localhost:4000';
    const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    
    console.log('File uploaded successfully:', fileUrl);
    
    res.json({
      success: true,
      data: {
        name: req.file.filename,
        content: fileUrl
      }
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading image: ' + error.message
    });
  }
});

// Delete image endpoint
router.delete('/image/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);
    
    // Check if file exists
    if (fs.existsSync(filePath)) {
      // Delete the file
      fs.unlinkSync(filePath);
      res.json({
        success: true,
        message: 'Image deleted successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting image: ' + error.message
    });
  }
});

export default router;

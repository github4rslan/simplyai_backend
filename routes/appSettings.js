import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// GET /api/app-settings
router.get('/app-settings', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM app_settings LIMIT 1');
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No app settings found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: rows[0] 
    });
  } catch (error) {
    console.error('Error fetching app settings:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

export default router;

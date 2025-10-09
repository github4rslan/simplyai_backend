import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// GET /api/payment-settings - Get payment configuration
router.get('/', async (req, res) => {
  try {
    console.log('🔍 Fetching payment settings...');
    
    const [rows] = await pool.query(`
      SELECT enable_payments, currency, vat_percentage, stripe_public_key 
      FROM app_settings 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (rows.length === 0) {
      console.log('⚠️ No payment settings found, using defaults');
      return res.json({
        success: true,
        data: {
          enable_payments: true,
          currency: 'EUR',
          vat_percentage: 22.0,
          stripe_public_key: process.env.STRIPE_PUBLISHABLE_KEY || ''
        }
      });
    }

    const settings = rows[0];
    console.log('✅ Payment settings loaded:', {
      enable_payments: settings.enable_payments,
      currency: settings.currency,
      vat_percentage: settings.vat_percentage,
      stripe_public_key: settings.stripe_public_key ? 'Present' : 'Not set'
    });

    res.json({
      success: true,
      data: {
        enable_payments: settings.enable_payments,
        currency: settings.currency || 'EUR',
        vat_percentage: settings.vat_percentage || 22.0,
        stripe_public_key: settings.stripe_public_key || process.env.STRIPE_PUBLISHABLE_KEY || ''
      }
    });
  } catch (error) {
    console.error('❌ Error fetching payment settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payment settings',
      error: error.message 
    });
  }
});

export default router;

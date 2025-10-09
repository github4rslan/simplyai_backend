import express from 'express';
import Stripe from 'stripe';
import { pool } from '../db.js';

const router = express.Router();

// POST /api/stripe/create-payment-intent
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency: requestCurrency } = req.body;
    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // Get payment settings from database
    let currency = 'eur'; // default fallback
    let stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    try {
      const [settings] = await pool.query(`
        SELECT currency, stripe_secret_key 
        FROM app_settings 
        ORDER BY created_at DESC 
        LIMIT 1
      `);
      
      if (settings.length > 0) {
        currency = (settings[0].currency || 'EUR').toLowerCase();
        
        // Use database Stripe key if available, otherwise fallback to env
        if (settings[0].stripe_secret_key && settings[0].stripe_secret_key.trim()) {
          stripeSecretKey = settings[0].stripe_secret_key;
          console.log('💳 Using Stripe secret key from database');
        } else {
          console.log('💳 Using Stripe secret key from environment variables');
        }
      }
      
      console.log('💱 Payment Intent Details:');
      console.log(`  Amount: ${amount} (smallest currency unit)`);
      console.log(`  Currency: ${currency}`);
      console.log(`  Request Currency: ${requestCurrency || 'not specified'}`);
    } catch (dbError) {
      console.warn('⚠️ Could not fetch payment settings from database, using defaults:', dbError.message);
    }

    // Override currency if explicitly provided in request
    if (requestCurrency) {
      currency = requestCurrency.toLowerCase();
      console.log(`🔄 Currency overridden by request: ${currency}`);
    }

    // Initialize Stripe with the secret key
    if (!stripeSecretKey) {
      console.error('❌ No Stripe secret key available');
      return res.status(500).json({ error: 'Stripe configuration missing' });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2022-11-15',
    });

    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      // You can add metadata or receipt_email here if needed
    });

    console.log('✅ PaymentIntent created successfully:', paymentIntent.id);
    
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('❌ Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

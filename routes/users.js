import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// Get user's current subscription/plan information
router.get('/:userId/subscription', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('Fetching subscription for user:', userId);
    
    // Query to get user's current active subscription
    const [rows] = await pool.query(
      `SELECT 
         us.plan_id as planId,
         sp.name as planName,
         sp.price,
         us.status,
         us.created_at
       FROM user_subscriptions us
       JOIN subscription_plans sp ON us.plan_id = sp.id
       WHERE us.user_id = ? AND us.status = 'active'
       ORDER BY us.created_at DESC 
       LIMIT 1`,
      [userId]
    );
    
    if (rows.length === 0) {
      console.log('No active subscription found for user:', userId);
      return res.status(404).json({ 
        success: false, 
        message: 'No active subscription found' 
      });
    }
    
    console.log('Found subscription for user:', userId, rows[0]);
    
    res.json({
      success: true,
      data: {
        planId: rows[0].planId,
        planName: rows[0].planName,
        price: rows[0].price,
        status: rows[0].status,
        createdAt: rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Error fetching user subscription:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

export default router;

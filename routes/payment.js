import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { sendPaymentNotificationEmail } from '../services/emailService.js';
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Process regular payment and create account
router.post('/process-payment', async (req, res) => {
  const { userInfo, paymentInfo, planInfo, tempUserId } = req.body;
  
  console.log('💳 Processing payment request...');
  console.log('User Info:', userInfo);
  console.log('Payment Info:', paymentInfo);
  console.log('Plan Info:', planInfo);
  console.log('Temp User ID:', tempUserId);

  try {
    // Validate required fields
    if (!userInfo.email || !userInfo.firstName || !paymentInfo.method || !planInfo.id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    let userData;
    let hashedPassword;

    // Check if this is a temporary registration (paid plan) or direct payment
    if (tempUserId) {
      console.log('🔍 Looking up temporary registration data...');
      
      // Get temporary registration data
      const [tempData] = await pool.query(
        'SELECT * FROM temp_registrations WHERE id = ? AND email = ? AND expires_at > NOW()',
        [tempUserId, userInfo.email]
      );

      if (tempData.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Temporary registration not found or expired. Please register again.'
        });
      }

      const tempReg = tempData[0];
      userData = {
        id: tempReg.id,
        email: tempReg.email,
        firstName: tempReg.first_name,
        lastName: tempReg.last_name,
        phone: tempReg.phone
      };
      hashedPassword = tempReg.password_hash;
      
      console.log('✅ Temporary registration found:', userData.id);
    } else {
      // Direct payment without prior registration (existing flow)
      // Check if user already exists
      const [existingUsers] = await pool.query(
        'SELECT id FROM profiles WHERE email = ?',
        [userInfo.email]
      );

      if (existingUsers.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }

      // Generate new user data
      userData = {
        id: uuidv4(),
        email: userInfo.email,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName || '',
        phone: userInfo.phone || null
      };

      // Hash password if provided, otherwise generate a temporary one
      const tempPassword = userInfo.password || Math.random().toString(36).slice(-8);
      hashedPassword = await bcrypt.hash(tempPassword, 10);
    }

    // Generate transaction ID
    const transactionId = `TXN_${Date.now()}_${uuidv4().substring(0, 8)}`;

    // Get database connection for transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Create user profile and auth records
      await connection.query(
        `INSERT INTO profiles (
          id, email, first_name, last_name, phone, full_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          userData.id,
          userData.email,
          userData.firstName,
          userData.lastName,
          userData.phone,
          `${userData.firstName} ${userData.lastName}`
        ]
      );

      // Create auth record
      await connection.query(
        'INSERT INTO auth (user_id, password_hash, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
        [userData.id, hashedPassword]
      );

      // Create subscription
      await connection.query(
        'INSERT INTO user_subscriptions (id, user_id, plan_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [uuidv4(), userData.id, planInfo.id, 'active']
      );

      // Store payment information
      await connection.query(
        `INSERT INTO user_payments (
          user_id, plan_id, amount, payment_method, stripe_payment_intent_id, created_at
        ) VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          userData.id,
          planInfo.id,
          paymentInfo.amount,
          paymentInfo.method,
          transactionId // If you have the real Stripe PaymentIntent ID, use it here instead
        ]
      );

      // If this was a temporary registration, clean it up
      if (tempUserId) {
        await connection.query(
          'DELETE FROM temp_registrations WHERE id = ?',
          [tempUserId]
        );
        console.log('🧹 Cleaned up temporary registration:', tempUserId);
      }

      // Commit transaction
      await connection.commit();
      connection.release();

      console.log('✅ User account created successfully after payment:', userData.id);

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: userData.id, 
          email: userData.email,
          planId: planInfo.id
        },
        process.env.JWT_SECRET || 'default_secret',
        { expiresIn: '24h' }
      );

      // Send payment notification email using new unified format
      const emailResult = await sendPaymentNotificationEmail({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        planName: planInfo.name,
        planPrice: planInfo.price,
        planType: planInfo.type,
        paymentMethod: paymentInfo.method,
        transactionId: transactionId,
        isFreeRegistration: false
      });
      
      console.log('✅ Payment processed successfully');
      console.log('📧 Email notification result:', emailResult);

      res.json({
        success: true,
        message: 'Payment processed and account created successfully',
        data: {
          user: userData,
          token: token,
          transactionId: transactionId,
          emailSent: emailResult.success
        }
      });

    } catch (dbError) {
      await connection.rollback();
      connection.release();
      throw dbError;
    }

  } catch (error) {
    console.error('❌ Error processing payment:', error);
    res.status(500).json({
      success: false,
      message: 'Payment processing failed',
      error: error.message
    });
  }
});

// Process payment for existing OAuth users
router.post('/process-oauth-payment', async (req, res) => {
  const { userId, userInfo, paymentInfo, planInfo } = req.body;
  
  console.log('💳 Processing OAuth user payment...');
  console.log('📊 Complete request body:', JSON.stringify(req.body, null, 2));
  console.log('🔍 Individual fields:');
  console.log('- User ID:', userId, '(type:', typeof userId, ')');
  console.log('- User Info:', JSON.stringify(userInfo, null, 2));
  console.log('- Payment Info:', JSON.stringify(paymentInfo, null, 2));
  console.log('- Plan Info:', JSON.stringify(planInfo, null, 2));

  try {
    // Validate required fields with detailed logging
    console.log('🔍 Validating required fields...');
    
    if (!userId) {
      console.error('❌ Missing userId:', userId);
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId'
      });
    }
    
    if (!userInfo || !userInfo.email) {
      console.error('❌ Missing userInfo.email:', userInfo?.email);
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userInfo.email'
      });
    }
    
    if (!paymentInfo || !paymentInfo.method) {
      console.error('❌ Missing paymentInfo.method:', paymentInfo?.method);
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: paymentInfo.method'
      });
    }
    
    if (!planInfo || !planInfo.id) {
      console.error('❌ Missing planInfo.id:', planInfo?.id);
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: planInfo.id'
      });
    }
    
    console.log('✅ All required fields validated successfully');

    // Verify user exists, if not create them (for OAuth users)
    let [existingUsers] = await pool.query(
      'SELECT id, email, first_name, last_name FROM profiles WHERE id = ?',
      [userId]
    );

    let user;
    if (existingUsers.length === 0) {
      console.log('👤 User not found, creating OAuth user profile...');
      // Create the OAuth user profile
      await pool.query(
        `INSERT INTO profiles (
          id, email, first_name, last_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [
          userId,
          userInfo.email,
          userInfo.firstName || '',
          userInfo.lastName || ''
        ]
      );
      
      user = {
        id: userId,
        email: userInfo.email,
        first_name: userInfo.firstName || '',
        last_name: userInfo.lastName || ''
      };
      console.log('✅ OAuth user profile created:', user);
    } else {
      user = existingUsers[0];
      console.log('✅ Existing user found:', user);
    }

    // Generate transaction ID
    const transactionId = `TXN_${Date.now()}_${uuidv4().substring(0, 8)}`;

    // Get database connection for transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Store payment information for existing user
      await connection.query(
        `INSERT INTO user_payments (
          user_id, plan_id, amount, payment_method, stripe_payment_intent_id, created_at
        ) VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          userId,
          planInfo.id,
          paymentInfo.amount,
          paymentInfo.method,
          transactionId // If you have the real Stripe PaymentIntent ID, use it here instead
        ]
      );

      // Commit transaction
      await connection.commit();
      connection.release();

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: userId, 
          email: user.email,
          planId: planInfo.id
        },
        process.env.JWT_SECRET || 'default_secret',
        { expiresIn: '24h' }
      );

      // Prepare user data for response
      const userData = {
        id: userId,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name || '',
        planId: planInfo.id
      };

      // Fetch plan details for email
      const [planDetails] = await pool.query(
        'SELECT name, price FROM subscription_plans WHERE id = ?',
        [planInfo.id]
      );

      const actualPlanInfo = {
        ...planInfo,
        name: planDetails.length > 0 ? planDetails[0].name : planInfo.name || 'Unknown Plan',
        price: planDetails.length > 0 ? planDetails[0].price : planInfo.price
      };

      console.log('📋 Plan details fetched for email:', actualPlanInfo);

      // Send payment notification email using new unified format
      const emailResult = await sendPaymentNotificationEmail({
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name || '',
        planName: actualPlanInfo.name,
        planPrice: actualPlanInfo.price,
        planType: actualPlanInfo.type,
        paymentMethod: paymentInfo.method,
        transactionId: transactionId,
        isFreeRegistration: false
      });
      
      console.log('✅ OAuth payment processed successfully');
      console.log('📧 Email notification result:', emailResult);

      res.json({
        success: true,
        message: 'Payment processed successfully',
        data: {
          user: userData,
          token: token,
          transactionId: transactionId,
          emailSent: emailResult.success
        }
      });

    } catch (dbError) {
      await connection.rollback();
      connection.release();
      throw dbError;
    }

  } catch (error) {
    console.error('❌ Error processing OAuth payment:', error);
    res.status(500).json({
      success: false,
      message: 'OAuth payment processing failed',
      error: error.message
    });
  }
});

export default router;

// Subscribe to a free plan for an already logged-in user
router.post('/subscribe-free', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ success: false, message: 'planId is required' });
    }

    // Validate plan is free
    const [plans] = await pool.query(
      'SELECT id, name, is_free, price FROM subscription_plans WHERE id = ? LIMIT 1',
      [planId]
    );

    if (plans.length === 0) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const plan = plans[0];
    if (!(plan.is_free || plan.price === 0)) {
      return res.status(400).json({ success: false, message: 'Selected plan is not free' });
    }

    // Deactivate existing active subscriptions for the user
    await pool.query(
      "UPDATE user_subscriptions SET status = 'canceled' WHERE user_id = ? AND status = 'active'",
      [userId]
    );

    // Create or reactivate subscription
    const [existing] = await pool.query(
      "SELECT id FROM user_subscriptions WHERE user_id = ? AND plan_id = ? LIMIT 1",
      [userId, planId]
    );

    if (existing.length > 0) {
      await pool.query(
        "UPDATE user_subscriptions SET status = 'active', started_at = NOW(), updated_at = NOW() WHERE id = ?",
        [existing[0].id]
      );
    } else {
      await pool.query(
        "INSERT INTO user_subscriptions (id, user_id, plan_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, 'active', NOW(), NOW(), NOW())",
        [uuidv4(), userId, planId]
      );
    }

    return res.json({
      success: true,
      message: 'Free plan activated',
      data: {
        planId: plan.id,
        planName: plan.name,
      },
    });
  } catch (error) {
    console.error('Error subscribing to free plan:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to subscribe to free plan',
      error: error.message,
    });
  }
});

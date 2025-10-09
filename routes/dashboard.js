import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Fetching dashboard statistics...');
    
    // Get total users from profiles table
    const [userCountResult] = await pool.query('SELECT COUNT(*) as count FROM profiles');
    const totalUsers = userCountResult[0].count;
    console.log('👥 Total users:', totalUsers);
    
    // Get total questionnaires from questionnaire_config table
    const [questionnaireCountResult] = await pool.query('SELECT COUNT(*) as count FROM questionnaire_config');
    const activeQuestionnaires = questionnaireCountResult[0].count;
    console.log('📋 Active questionnaires:', activeQuestionnaires);
    
    // Get total responses from questionnaire_responses table
    const [responseCountResult] = await pool.query('SELECT COUNT(*) as count FROM questionnaire_responses');
    const completedQuestionnaires = responseCountResult[0].count;
    console.log('✅ Completed questionnaires:', completedQuestionnaires);
    
    // Get total reports from reports table
    const [reportCountResult] = await pool.query('SELECT COUNT(*) as count FROM reports');
    const totalReports = reportCountResult[0].count;
    console.log('📄 Total reports:', totalReports);
    
    const stats = {
      totalUsers,
      activeQuestionnaires,
      completedQuestionnaires,
      totalReports
    };
    
    console.log('📊 Dashboard stats compiled:', stats);
    
    res.json({ 
      success: true, 
      data: stats 
    });
  } catch (error) {
    console.error('❌ Error fetching dashboard stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard statistics',
      error: error.message 
    });
  }
});

// GET /api/dashboard/recent-users
router.get('/recent-users', async (req, res) => {
  try {
    console.log('👥 Fetching recent users...');
    
    const [users] = await pool.query(`
      SELECT id, first_name, last_name, email, created_at 
      FROM profiles 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log(`👥 Found ${users.length} recent users`);
    
    res.json({ 
      success: true, 
      data: users 
    });
  } catch (error) {
    console.error('❌ Error fetching recent users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch recent users',
      error: error.message 
    });
  }
});

// GET /api/dashboard/recent-responses
router.get('/recent-responses', async (req, res) => {
  try {
    console.log('📝 Fetching recent questionnaire responses...');
    
    const [responses] = await pool.query(`
      SELECT qr.id, qr.user_id, qr.status, qr.created_at, qr.updated_at,
             p.first_name, p.last_name, p.email
      FROM questionnaire_responses qr
      LEFT JOIN profiles p ON qr.user_id = p.id
      ORDER BY qr.created_at DESC 
      LIMIT 5
    `);
    
    console.log(`📝 Found ${responses.length} recent responses`);
    
    res.json({ 
      success: true, 
      data: responses 
    });
  } catch (error) {
    console.error('❌ Error fetching recent responses:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch recent responses',
      error: error.message 
    });
  }
});

export default router;

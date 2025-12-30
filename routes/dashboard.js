import express from 'express';
import { db } from '../config/knex.js';

const router = express.Router();

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Fetching dashboard statistics...');
    
    // Get total users from profiles table
    const userCountResult = await db('profiles').count('* as count').first();
    const totalUsers = userCountResult.count;
    console.log('👥 Total users:', totalUsers);
    
    // Get total questionnaires from questionnaire_config table
    const questionnaireCountResult = await db('questionnaire_config').count('* as count').first();
    const activeQuestionnaires = questionnaireCountResult.count;
    console.log('📋 Active questionnaires:', activeQuestionnaires);
    
    // Get total responses from questionnaire_responses table
    const responseCountResult = await db('questionnaire_responses').count('* as count').first();
    const completedQuestionnaires = responseCountResult.count;
    console.log('✅ Completed questionnaires:', completedQuestionnaires);
    
    // Get total reports from reports table
    const reportCountResult = await db('reports').count('* as count').first();
    const totalReports = reportCountResult.count;
    console.log('📄 Total reports:', totalReports);
    
    const stats = {
      totalUsers,
      activeQuestionnaires,
      completedQuestionnaires,
      totalReports
    };
    
    console.log('📊 Dashboard stats compiled:', stats);
    
    res.success('Dashboard statistics retrieved', stats);
  } catch (error) {
    console.error('❌ Error fetching dashboard stats:', error);
    res.fail(500, 'Failed to fetch dashboard statistics', { error: error.message });
  }
});

// GET /api/dashboard/recent-users
router.get('/recent-users', async (req, res) => {
  try {
    console.log('👥 Fetching recent users...');
    
    const users = await db('profiles')
      .select('id', 'first_name', 'last_name', 'email', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(5);
    
    console.log(`👥 Found ${users.length} recent users`);
    
    res.success('Recent users retrieved', users);
  } catch (error) {
    console.error('❌ Error fetching recent users:', error);
    res.fail(500, 'Failed to fetch recent users', { error: error.message });
  }
});

// GET /api/dashboard/recent-responses
router.get('/recent-responses', async (req, res) => {
  try {
    console.log('📝 Fetching recent questionnaire responses...');
    
    const responses = await db('questionnaire_responses as qr')
      .select(
        'qr.id',
        'qr.user_id',
        'qr.status',
        'qr.created_at',
        'qr.updated_at',
        'p.first_name',
        'p.last_name',
        'p.email'
      )
      .leftJoin('profiles as p', 'qr.user_id', 'p.id')
      .orderBy('qr.created_at', 'desc')
      .limit(5);
    
    console.log(`📝 Found ${responses.length} recent responses`);
    
    res.success('Recent responses retrieved', responses);
  } catch (error) {
    console.error('❌ Error fetching recent responses:', error);
    res.fail(500, 'Failed to fetch recent responses', { error: error.message });
  }
});

export default router;

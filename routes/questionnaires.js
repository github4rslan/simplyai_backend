import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// Get all published questionnaires
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, description, status FROM questionnaire_config WHERE status = ? ORDER BY title ASC',
      ['published']
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching questionnaires:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch questionnaires'
    });
  }
});

// Get questionnaire by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT * FROM questionnaire_config WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Questionnaire not found'
      });
    }
    
    const questionnaire = rows[0];
    questionnaire.questions = typeof questionnaire.questions === 'string' 
      ? JSON.parse(questionnaire.questions) 
      : questionnaire.questions;
    
    res.json({
      success: true,
      data: questionnaire
    });
  } catch (error) {
    console.error('Error fetching questionnaire:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch questionnaire'
    });
  }
});

export default router;

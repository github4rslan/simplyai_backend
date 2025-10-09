import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// Create or update SurveyJS form
router.post('/', async (req, res) => {
  const { id, title, description, surveyJSON, logo, status, createdBy } = req.body;
  
  console.log('Received form data:', { id, title, description, logo, status, createdBy });
  console.log('SurveyJSON type:', typeof surveyJSON);
  console.log('SurveyJSON length:', JSON.stringify(surveyJSON).length);
  
  try {
    // Validate required fields
    if (!title || !surveyJSON) {
      console.log('Validation failed: missing title or surveyJSON');
      return res.status(400).json({ 
        success: false, 
        message: 'Title and survey JSON are required' 
      });
    }


    
    if (id) {
      // Update existing form
      const [result] = await pool.query(
        `UPDATE questionnaire_config 
         SET title = ?, description = ?, questions = ?, logo = ?, status = ?, updated_at = NOW()
         WHERE id = ?`,
        [title, description || '', JSON.stringify(surveyJSON), logo || null, status || 'draft', id]
      );
      console.log('Update result:', result);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Form not found for update', id });
      }
      res.json({ 
        success: true, 
        message: 'Form updated successfully',
        id: id
      });
    } else {
      // Create new form
      console.log('Creating new form with SQL:', `INSERT INTO questionnaire_config (title, description, questions, logo, status, created_by) VALUES (?, ?, ?, ?, ?, ?)`);
      console.log('SQL parameters:', [title, description || '', JSON.stringify(surveyJSON), logo || null, status || 'draft', createdBy || null]);
      
      const [result] = await pool.query(
        `INSERT INTO questionnaire_config 
         (title, description, questions, logo, status, created_by) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          title, 
          description || '', 
          JSON.stringify(surveyJSON), 
          logo || null,
          status || 'draft',
          createdBy || null
        ]
      );
      
      console.log('Form created successfully with ID:', result.insertId);
      
      res.status(201).json({ 
        success: true, 
        message: 'Form created successfully',
        id: result.insertId
      });
    }
  } catch (err) {
    console.error('Error saving form:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error saving form: ' + err.message 
    });
  }
});

// Get all forms with optional status filter
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM questionnaire_config';
    let params = [];
    
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC';
    
    console.log('Executing query:', query, 'with params:', params);
    const [rows] = await pool.query(query, params);
    console.log('Query result rows:', rows.length);
    
    // Parse the JSON questions for each form
    const forms = rows.map(row => {
      try {
        let questions = null;
        if (row.questions) {
          // If it's already an object, use it directly
          if (typeof row.questions === 'object') {
            questions = row.questions;
          } else {
            // If it's a string, try to parse it
            questions = JSON.parse(row.questions);
          }
        }
        
        return {
          ...row,
          questions: questions
        };
      } catch (parseError) {
        console.error('Error parsing questions for form', row.id, ':', parseError);
        return {
          ...row,
          questions: null
        };
      }
    });
    
    res.json({ 
      success: true, 
      data: forms 
    });
  } catch (err) {
    console.error('Error fetching forms:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching forms: ' + err.message 
    });
  }
});

// Get single form by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM questionnaire_config WHERE id = ?', 
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Form not found' 
      });
    }
    
    const form = rows[0];
    
    // Handle questions parsing more safely
    try {
      if (form.questions) {
        // If it's already an object, use it directly
        if (typeof form.questions === 'object') {
          form.questions = form.questions;
        } else {
          // If it's a string, try to parse it
          form.questions = JSON.parse(form.questions);
        }
      } else {
        form.questions = null;
      }
    } catch (parseError) {
      console.error('Error parsing questions for form', form.id, ':', parseError);
      form.questions = null;
    }
    
    res.json({ 
      success: true, 
      data: form 
    });
  } catch (err) {
    console.error('Error fetching form:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching form: ' + err.message 
    });
  }
});

// Get guide for a specific question in a form
router.get('/:id/guide/:questionName', async (req, res) => {
  const { id, questionName } = req.params;
  try {
    // Fetch the form
    const [rows] = await pool.query('SELECT * FROM questionnaire_config WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Form not found' });
    }
    const form = rows[0];
    let questions = null;
    try {
      questions = typeof form.questions === 'object' ? form.questions : JSON.parse(form.questions);
    } catch {
      return res.status(500).json({ success: false, data: null, message: 'Invalid questions JSON' });
    }
    // Find the question by name
    let found = null;
    if (questions && Array.isArray(questions.pages)) {
      for (const page of questions.pages) {
        if (Array.isArray(page.elements)) {
          for (const q of page.elements) {
            if (q.name === questionName) {
              found = q;
              break;
            }
          }
        }
        if (found) break;
      }
    }
    if (!found) {
      return res.status(404).json({ success: false, data: null, message: 'Guide not found' });
    }
    // Return the guide (use q.description as guide, or q.guide if you have a custom field)
    const guideContent = found.guide || found.description || null;
    if (!guideContent) {
      return res.status(404).json({ success: false, data: null, message: 'Guide not found' });
    }
    res.json({ success: true, data: { content: guideContent } });
  } catch (err) {
    res.status(500).json({ success: false, data: null, message: 'Server error: ' + err.message });
  }
});

export default router;

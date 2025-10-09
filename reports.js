const express = require('express');
const router = express.Router();
const db = require('./db');

// GET /reports/:id/ai-response - fetch ai_response for a report
router.get('/:id/ai-response', async (req, res) => {
  const reportId = req.params.id;
  try {
    const [rows] = await db.query('SELECT ai_response FROM reports WHERE id = ?', [reportId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.json({ ai_response: rows[0].ai_response });
  } catch (err) {
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

module.exports = router;

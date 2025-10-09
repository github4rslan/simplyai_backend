import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// Get all reports for a user
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [rows] = await pool.query(
      `SELECT id, user_id, questionnaire_id, title, content, pdf_url, created_at, template_id
       FROM reports 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );
    console.log("report", rows);

    res.json({ success: true, reports: rows });
  } catch (error) {
    console.error("Error fetching user reports:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Get a specific report by ID
router.get("/:reportId", async (req, res) => {
  try {
    const { reportId } = req.params;

    const [rows] = await pool.query(
      `SELECT id, user_id, questionnaire_id, title, content, pdf_url, created_at, template_id
       FROM reports 
       WHERE id = ?`,
      [reportId]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });
    }

    res.json({ success: true, report: rows[0] });
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Add a new endpoint to fetch the ai_response column of a specific report
router.get("/:reportId/ai-response", async (req, res) => {
  try {
    const { reportId } = req.params;

    const [rows] = await pool.query(
      `SELECT ai_response FROM reports WHERE id = ?`,
      [reportId]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });
    }

    res.json({ success: true, aiResponse: rows[0].ai_response });
  } catch (error) {
    console.error("Error fetching AI response:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;

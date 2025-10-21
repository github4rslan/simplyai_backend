import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// Save questionnaire completion
// Backend API - Handles both draft and completion
router.post("/save-questionnaire-completion", async (req, res) => {
  try {
    const {
      user_id,
      questionnaire_id,
      questionnaire_title,
      responses,
      attempt_number,
      created_at,
      status = "completed", // NEW: Add status parameter, defaults to "completed"
    } = req.body;

    // Validate required fields
    if (!user_id || !questionnaire_id || !responses) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: user_id, questionnaire_id, responses",
      });
    }

    // Get user's current active subscription
    const [currentSub] = await pool.query(
      `
      SELECT id as subscription_id, plan_id 
      FROM user_subscriptions 
      WHERE user_id = ? AND status = 'active' 
      ORDER BY started_at DESC 
      LIMIT 1
    `,
      [user_id]
    );

    if (currentSub.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No active subscription found for user",
      });
    }

    const { subscription_id, plan_id } = currentSub[0];

    // Convert dates to MySQL datetime format
    const now = new Date();
    const mysqlDatetime = now.toISOString().slice(0, 19).replace("T", " ");
    const createdAtMysql = created_at
      ? new Date(created_at).toISOString().slice(0, 19).replace("T", " ")
      : mysqlDatetime;

    // Handle draft vs completed differently
    console.log(status);
    if (status === "draft") {
      // Check if a draft already exists
      const [existingDraft] = await pool.query(
        `SELECT id, version FROM questionnaire_responses 
         WHERE user_id = ? AND subscription_id = ? AND questionnaire_id = ? AND status = 'draft'`,
        [user_id, subscription_id, questionnaire_id]
      );

      if (existingDraft.length > 0) {
        // Update existing draft
        const newVersion = (existingDraft[0].version || 1) + 1;
        await pool.query(
          `UPDATE questionnaire_responses 
           SET answers = ?, updated_at = ?, version = ?
           WHERE id = ?`,
          [
            JSON.stringify(responses),
            mysqlDatetime,
            newVersion,
            existingDraft[0].id,
          ]
        );

        return res.json({
          success: true,
          message: "Draft updated successfully",
          id: existingDraft[0].id,
          status: "draft",
          version: newVersion,
        });
      } else {
        // Create new draft
        const [result] = await pool.query(
          `INSERT INTO questionnaire_responses 
           (user_id, subscription_id, questionnaire_id, answers, status, plan_id, attempt_number, created_at, updated_at, version) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user_id,
            subscription_id,
            questionnaire_id,
            JSON.stringify(responses),
            "draft",
            plan_id,
            1, // Drafts always have attempt_number = 1
            createdAtMysql,
            mysqlDatetime,
            1, // Initial version
          ]
        );

        return res.json({
          success: true,
          message: "Draft saved successfully",
          id: result.insertId,
          status: "draft",
          version: 1,
        });
      }
    } else {
      // Handle completed submission
      // Calculate attempt number for completed submissions
      const [prevAttempts] = await pool.query(
        `
        SELECT COUNT(*) as count 
        FROM questionnaire_responses 
        WHERE user_id = ? AND subscription_id = ? AND questionnaire_id = ? AND status = 'completed'
      `,
        [user_id, subscription_id, questionnaire_id]
      );

      const calculatedAttemptNumber = (prevAttempts[0]?.count || 0) + 1;

      // Insert completed questionnaire
      const [result] = await pool.query(
        `INSERT INTO questionnaire_responses 
         (user_id, subscription_id, questionnaire_id, answers, status, plan_id, attempt_number, completed_at, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user_id,
          subscription_id,
          questionnaire_id,
          JSON.stringify(responses),
          "completed",
          plan_id,
          calculatedAttemptNumber,
          mysqlDatetime, // Set completed_at for completed status
          createdAtMysql,
          mysqlDatetime,
        ]
      );

      // Optional: Delete any existing drafts after successful completion
      await pool.query(
        `DELETE FROM questionnaire_responses 
         WHERE user_id = ? AND subscription_id = ? AND questionnaire_id = ? AND status = 'draft'`,
        [user_id, subscription_id, questionnaire_id]
      );

      return res.json({
        success: true,
        message: "Questionnaire completion saved successfully",
        id: result.insertId,
        attempt_number: calculatedAttemptNumber,
        status: "completed",
      });
    }
  } catch (error) {
    console.error("Error saving questionnaire:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save questionnaire: " + error.message,
    });
  }
});

// NEW: Add endpoint to retrieve draft if exists
router.get(
  "/get-questionnaire-draft/:user_id/:questionnaire_id",
  async (req, res) => {
    try {
      const { user_id, questionnaire_id } = req.params;

      // Get user's current active subscription
      const [currentSub] = await pool.query(
        `SELECT id as subscription_id FROM user_subscriptions 
       WHERE user_id = ? AND status = 'active' 
       ORDER BY started_at DESC LIMIT 1`,
        [user_id]
      );

      if (currentSub.length === 0) {
        return res.json({ success: true, draft: null });
      }

      const { subscription_id } = currentSub[0];

      // Get draft if exists
      const [draft] = await pool.query(
        `SELECT id, answers, version, created_at, updated_at 
       FROM questionnaire_responses 
       WHERE user_id = ? AND subscription_id = ? AND questionnaire_id = ? AND status = 'draft'
       ORDER BY updated_at DESC LIMIT 1`,
        [user_id, subscription_id, questionnaire_id]
      );

      if (draft.length > 0) {
        return res.json({
          success: true,
          draft: {
            id: draft[0].id,
            answers: JSON.parse(draft[0].answers),
            version: draft[0].version,
            created_at: draft[0].created_at,
            updated_at: draft[0].updated_at,
          },
        });
      } else {
        return res.json({ success: true, draft: null });
      }
    } catch (error) {
      console.error("Error retrieving draft:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve draft: " + error.message,
      });
    }
  }
);

// Get questionnaire completions for a user
router.get("/questionnaire-completions", async (req, res) => {
  try {
    const { userId, questionnaireId, subscriptionId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId parameter is required",
      });
    }

    let query = "SELECT * FROM questionnaire_responses WHERE user_id = ?";
    let params = [userId];

    // If subscriptionId is provided, filter by it (recommended for current subscription)
    if (subscriptionId) {
      query += " AND subscription_id = ?";
      params.push(subscriptionId);
    }

    if (questionnaireId) {
      query += " AND questionnaire_id = ?";
      params.push(questionnaireId);
    }

    query += " ORDER BY created_at DESC";

    const [rows] = await pool.query(query, params);

    res.json(rows);
  } catch (error) {
    console.error("Error fetching questionnaire completions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch questionnaire completions: " + error.message,
    });
  }
});

// Get user plan options
router.get("/user-plan-options", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId parameter is required",
      });
    }

    // For testing verificationAfter plan type, return your example configuration
    // In production, this would query the actual user subscription
    const testPlanOption = {
      reminderCount: 1,
      maxRepetitions: 4,
      reminderMessage:
        "È il momento di completare il tuo questionario! Accedi per continuare il tuo percorso.",
      minWaitingPeriod: 22,
      reminderFrequency: "once",
      verificationAfter: true, // This is the key setting for your test
      emailNotifications: true,
      reminderDaysBefore: 7,
      verificationPeriod: 90,
      singleQuestionnaire: false,
      multipleQuestionnaires: false,
      periodicQuestionnaires: false,
      progressQuestionnaires: false,
    };

    res.json({
      success: true,
      option: testPlanOption,
    });

    /* 
    // Actual database query for production:
    const [rows] = await pool.query(`
      SELECT sp.option 
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = ? AND us.status = 'active'
      LIMIT 1
    `, [userId]);

    if (rows.length === 0) {
      return res.json({
        success: false,
        message: 'No active subscription found for user'
      });
    }

    res.json({
      success: true,
      option: rows[0].option
    });
    */
  } catch (error) {
    console.error("Error fetching user plan options:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user plan options: " + error.message,
    });
  }
});

export default router;

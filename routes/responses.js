import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// Save questionnaire completion
router.post("/save-questionnaire-completion", async (req, res) => {
  try {
    const {
      user_id,
      questionnaire_id,
      questionnaire_title,
      responses,
      attempt_number,
      created_at,
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

    // Calculate attempt number for this specific subscription
    const [prevAttempts] = await pool.query(
      `
      SELECT COUNT(*) as count 
      FROM questionnaire_responses 
      WHERE user_id = ? AND subscription_id = ? AND questionnaire_id = ? AND status = 'completed'
    `,
      [user_id, subscription_id, questionnaire_id]
    );

    const calculatedAttemptNumber = (prevAttempts[0]?.count || 0) + 1;

    // Convert dates to MySQL datetime format
    const now = new Date();
    const mysqlDatetime = now.toISOString().slice(0, 19).replace("T", " ");
    const createdAtMysql = created_at
      ? new Date(created_at).toISOString().slice(0, 19).replace("T", " ")
      : mysqlDatetime;

    // Insert into questionnaire_responses table with subscription_id
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
        mysqlDatetime,
        createdAtMysql,
        mysqlDatetime,
      ]
    );

    res.json({
      success: true,
      message: "Questionnaire completion saved successfully",
      id: result.insertId,
      attempt_number: calculatedAttemptNumber,
    });
  } catch (error) {
    console.error("Error saving questionnaire completion:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save questionnaire completion: " + error.message,
    });
  }
});

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

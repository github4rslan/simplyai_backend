import express from "express";
import { db } from "../config/knex.js";

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
    const currentSub = await db("user_subscriptions")
      .select("id as subscription_id", "plan_id")
      .where("user_id", user_id)
      .where("status", "active")
      .orderBy("started_at", "desc")
      .limit(1);

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
      const existingDraft = await db("questionnaire_responses")
        .select("id", "version")
        .where("user_id", user_id)
        .where("subscription_id", subscription_id)
        .where("questionnaire_id", questionnaire_id)
        .where("status", "draft")
        .first();

      if (existingDraft) {
        // Update existing draft
        const newVersion = (existingDraft.version || 1) + 1;
        await db("questionnaire_responses")
          .where("id", existingDraft.id)
          .update({
            answers: JSON.stringify(responses),
            updated_at: mysqlDatetime,
            version: newVersion,
          });

        return res.json({
          success: true,
          message: "Draft updated successfully",
          id: existingDraft.id,
          status: "draft",
          version: newVersion,
        });
      } else {
        // Create new draft
        const result = await db("questionnaire_responses").insert({
          user_id,
          subscription_id,
          questionnaire_id,
          answers: JSON.stringify(responses),
          status: "draft",
          plan_id,
          attempt_number: 1, // Drafts always have attempt_number = 1
          created_at: createdAtMysql,
          updated_at: mysqlDatetime,
          version: 1, // Initial version
        });

        const insertedId = result[0];
        return res.json({
          success: true,
          message: "Draft saved successfully",
          id: insertedId,
          status: "draft",
          version: 1,
        });
      }
    } else {
      // Handle completed submission
      // Calculate attempt number for completed submissions
      const prevAttempts = await db("questionnaire_responses")
        .count("* as count")
        .where("user_id", user_id)
        .where("subscription_id", subscription_id)
        .where("questionnaire_id", questionnaire_id)
        .where("status", "completed")
        .first();

      const calculatedAttemptNumber = (prevAttempts.count || 0) + 1;

      // Insert completed questionnaire
      const result = await db("questionnaire_responses").insert({
        user_id,
        subscription_id,
        questionnaire_id,
        answers: JSON.stringify(responses),
        status: "completed",
        plan_id,
        attempt_number: calculatedAttemptNumber,
        completed_at: mysqlDatetime, // Set completed_at for completed status
        created_at: createdAtMysql,
        updated_at: mysqlDatetime,
      });

      // Optional: Delete any existing drafts after successful completion
      await db("questionnaire_responses")
        .where("user_id", user_id)
        .where("subscription_id", subscription_id)
        .where("questionnaire_id", questionnaire_id)
        .where("status", "draft")
        .delete();

      return res.json({
        success: true,
        message: "Questionnaire completion saved successfully",
        id: result[0],
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
      const currentSub = await db("user_subscriptions")
        .select("id as subscription_id")
        .where("user_id", user_id)
        .where("status", "active")
        .orderBy("started_at", "desc")
        .limit(1)
        .first();

      if (!currentSub) {
        return res.json({ success: true, draft: null });
      }

      const { subscription_id } = currentSub;

      // Get draft if exists
      const draft = await db("questionnaire_responses")
        .select("id", "answers", "version", "created_at", "updated_at")
        .where("user_id", user_id)
        .where("subscription_id", subscription_id)
        .where("questionnaire_id", questionnaire_id)
        .where("status", "draft")
        .orderBy("updated_at", "desc")
        .limit(1)
        .first();

      if (draft) {
        return res.json({
          success: true,
          draft: {
            id: draft.id,
            answers: JSON.parse(draft.answers),
            version: draft.version,
            created_at: draft.created_at,
            updated_at: draft.updated_at,
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

    let query = db("questionnaire_responses").select("*").where("user_id", userId);

    // If subscriptionId is provided, filter by it (recommended for current subscription)
    if (subscriptionId) {
      query = query.where("subscription_id", subscriptionId);
    }

    if (questionnaireId) {
      query = query.where("questionnaire_id", questionnaireId);
    }

    query = query.orderBy("created_at", "desc");

    const rows = await query;

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

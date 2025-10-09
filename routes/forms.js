import express from "express";
import { pool } from "../db.js";
import { authenticateToken } from "./auth.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

router.post("/", async (req, res) => {
  let { id, title, description, surveyJSON, logo, status, createdBy } =
    req.body;

  // Normalize the id value - convert invalid values to null
  if (!id || id === "" || id === "new" || id === "0") {
    id = null;
  }

  console.log("Received form data:", {
    id,
    title,
    description,
    logo,
    status,
    createdBy,
  });

  try {
    // Validate required fields
    if (!title || !surveyJSON) {
      console.log("Validation failed: missing title or surveyJSON");
      return res.status(400).json({
        success: false,
        message: "Title and survey JSON are required",
      });
    }

    if (id) {
      // Update existing form
      console.log("Updating existing form with ID:", id);
      const [result] = await pool.query(
        `UPDATE questionnaire_config 
         SET title = ?, 
             description = ?, 
             questions = ?, 
             logo = ?, 
             status = ?, 
             updated_at = NOW()
         WHERE id = ?`,
        [
          title,
          description || null,
          JSON.stringify(surveyJSON),
          logo || null,
          status || "draft",
          id,
        ]
      );

      console.log("Update result:", result);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Form not found for update",
          id,
        });
      }

      res.json({
        success: true,
        message: "Form updated successfully",
        id: id,
      });
    } else {
      // Create new form with UUID
      const newId = uuidv4();
      console.log("Creating new form with UUID:", newId);

      const [result] = await pool.query(
        `INSERT INTO questionnaire_config 
         (id, title, description, questions, logo, status, created_by, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          newId,
          title,
          description || null,
          JSON.stringify(surveyJSON),
          logo || null,
          status || "draft",
          createdBy || null,
        ]
      );

      console.log("Form created successfully with ID:", newId);

      res.status(201).json({
        success: true,
        message: "Form created successfully",
        id: newId,
      });
    }
  } catch (err) {
    console.error("Error saving form:", err);
    res.status(500).json({
      success: false,
      message: "Error saving form: " + err.message,
    });
  }
});
// Get all forms with optional status filter
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    let query = "SELECT * FROM questionnaire_config";
    let params = [];

    if (status) {
      query += " WHERE status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    console.log("Executing query:", query, "with params:", params);
    const [rows] = await pool.query(query, params);
    console.log("Query result rows:", rows.length);

    // Parse the JSON questions for each form
    const forms = rows.map((row) => {
      try {
        let questions = null;
        if (row.questions) {
          // If it's already an object, use it directly
          if (typeof row.questions === "object") {
            questions = row.questions;
          } else {
            // If it's a string, try to parse it
            questions = JSON.parse(row.questions);
          }
        }

        return {
          ...row,
          questions: questions,
        };
      } catch (parseError) {
        console.error(
          "Error parsing questions for form",
          row.id,
          ":",
          parseError
        );
        return {
          ...row,
          questions: null,
        };
      }
    });

    res.json({
      success: true,
      data: forms,
    });
  } catch (err) {
    console.error("Error fetching forms:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching forms: " + err.message,
    });
  }
});

// Get questionnaires for authenticated user based on their subscription plan
router.get("/user-questionnaires", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log("Fetching questionnaires for user:", userId);

    // Get user's active subscription
    const [userSubscriptions] = await pool.query(
      `SELECT us.plan_id, sp.name as plan_name 
       FROM user_subscriptions us
       JOIN subscription_plans sp ON us.plan_id = sp.id
       WHERE us.user_id = ? AND us.status = 'active'
       ORDER BY us.created_at DESC 
       LIMIT 1`,
      [userId]
    );

    if (userSubscriptions.length === 0) {
      console.log("No active subscription found for user:", userId);
      return res.json({
        success: true,
        data: [],
        message: "No active subscription found",
      });
    }

    const userPlan = userSubscriptions[0];
    console.log("User plan:", userPlan);

    // Get questionnaires associated with the user's plan
    const [questionnaires] = await pool.query(
      `SELECT 
         qc.id,
         qc.title,
         qc.description,
         qc.status,
         qc.logo,
         qc.created_at,
         qc.updated_at,
         pq.sequence_order
       FROM questionnaire_config qc
       JOIN plan_questionnaires pq ON qc.id = pq.questionnaire_id
       WHERE pq.plan_id = ? AND qc.status = 'published'
       ORDER BY pq.sequence_order ASC, qc.created_at DESC`,
      [userPlan.plan_id]
    );

    console.log(
      `Found ${questionnaires.length} questionnaires for plan:`,
      userPlan.plan_name
    );

    res.json({
      success: true,
      data: questionnaires,
      planInfo: {
        planId: userPlan.plan_id,
        planName: userPlan.plan_name,
      },
    });
  } catch (err) {
    console.error("Error fetching user questionnaires:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching questionnaires: " + err.message,
    });
  }
});

// Get user subscription details with questionnaires for dashboard
router.get("/user-subscription", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 1) Fetch the most recent active subscription
    const [subs] = await pool.execute(
      `
        SELECT
          us.id               AS subscription_id,
          us.user_id,
          us.plan_id,
          us.started_at,
          us.expires_at,
          us.status,
          sp.name             AS plan_name,
          sp.description      AS plan_description,
          sp.price,
          sp.is_free,
          sp.plan_type,
          sp.features
        FROM user_subscriptions AS us
        JOIN subscription_plans   AS sp ON us.plan_id = sp.id
        WHERE us.user_id = ? 
          AND us.status = 'active'
        ORDER BY us.started_at DESC
        LIMIT 1
        `,
      [userId]
    );

    if (subs.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No active subscription found" });
    }

    const subscription = subs[0];
    // Parse features as JSON if present and not null
    let features = [];
    if (subscription.features) {
      try {
        features =
          typeof subscription.features === "object"
            ? subscription.features
            : JSON.parse(subscription.features);
      } catch (e) {
        features = [];
      }
    }

    // 2) Optionally fetch questionnaires for this plan
    const [questions] = await pool.execute(
      `
        SELECT
          pq.questionnaire_id AS id,
          qc.title            AS name,
          qc.description,
          pq.sequence_order
        FROM plan_questionnaires AS pq
        JOIN questionnaire_config AS qc
          ON pq.questionnaire_id = qc.id
        WHERE pq.plan_id = ?
          AND qc.status = 'published'
        ORDER BY pq.sequence_order ASC
        `,
      [subscription.plan_id]
    );

    // 3) Shape and return
    res.json({
      success: true,
      data: {
        subscription_id: subscription.subscription_id,
        plan: {
          id: subscription.plan_id,
          name: subscription.plan_name,
          description: subscription.plan_description,
          price: subscription.price,
          is_free: !!subscription.is_free,
          plan_type: subscription.plan_type || null,
          features: features,
        },
        started_at: subscription.started_at,
        expires_at: subscription.expires_at, // uses the stored expires_at
        is_active: subscription.status === "active",
        questionnaires: questions.map((q) => ({
          id: q.id,
          name: q.name,
          sequence: q.sequence_order,
          description: q.description,
        })),
      },
      message: "Subscription data retrieved successfully",
    });
  } catch (err) {
    console.error("Error fetching subscription:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

// Get single form by ID
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM questionnaire_config WHERE id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Form not found",
      });
    }

    const form = rows[0];

    // Handle questions parsing more safely
    try {
      if (form.questions) {
        // If it's already an object, use it directly
        if (typeof form.questions === "object") {
          form.questions = form.questions;
        } else {
          // If it's a string, try to parse it
          form.questions = JSON.parse(form.questions);
        }
      } else {
        form.questions = null;
      }
    } catch (parseError) {
      console.error(
        "Error parsing questions for form",
        form.id,
        ":",
        parseError
      );
      form.questions = null;
    }

    res.json({
      success: true,
      data: form,
    });
  } catch (err) {
    console.error("Error fetching form:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching form: " + err.message,
    });
  }
});

// Get guide for a specific question in a form
router.get("/:id/guide/:questionName", async (req, res) => {
  const { id, questionName } = req.params;
  try {
    // Fetch the form
    const [rows] = await pool.query(
      "SELECT * FROM questionnaire_config WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, data: null, message: "Form not found" });
    }
    const form = rows[0];
    let questions = null;
    try {
      questions =
        typeof form.questions === "object"
          ? form.questions
          : JSON.parse(form.questions);
    } catch {
      return res.status(500).json({
        success: false,
        data: null,
        message: "Invalid questions JSON",
      });
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
      return res
        .status(404)
        .json({ success: false, data: null, message: "Guide not found" });
    }
    // Return the guide (use q.description as guide, or q.guide if you have a custom field)
    const guideContent = found.guide || found.description || null;
    if (!guideContent) {
      return res
        .status(404)
        .json({ success: false, data: null, message: "Guide not found" });
    }
    res.json({ success: true, data: { content: guideContent } });
  } catch (err) {
    res.status(500).json({
      success: false,
      data: null,
      message: "Server error: " + err.message,
    });
  }
});

// Delete form by ID
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  console.log("Attempting to delete form with ID:", id);

  try {
    // Check if form exists first
    const [checkRows] = await pool.query(
      "SELECT id, title FROM questionnaire_config WHERE id = ?",
      [id]
    );

    if (checkRows.length === 0) {
      console.log("Form not found for deletion:", id);
      return res.status(404).json({
        success: false,
        message: "Form not found",
      });
    }

    const formTitle = checkRows[0].title;
    console.log("Found form to delete:", formTitle);

    // Delete the form
    const [result] = await pool.query(
      "DELETE FROM questionnaire_config WHERE id = ?",
      [id]
    );

    console.log("Delete result:", result);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Form not found or already deleted",
      });
    }

    console.log("✅ Form deleted successfully:", formTitle);

    res.json({
      success: true,
      message: "Form deleted successfully",
      data: { id, title: formTitle },
    });
  } catch (err) {
    console.error("❌ Error deleting form:", err);
    res.status(500).json({
      success: false,
      message: "Server error while deleting form",
      error: err.message,
    });
  }
});

export default router;

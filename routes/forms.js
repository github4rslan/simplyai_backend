import express from "express";
import { db } from "../config/knex.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
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
      const affectedRows = await db("questionnaire_config")
        .where("id", id)
        .update({
          title,
          description: description || null,
          questions: JSON.stringify(surveyJSON),
          logo: logo || null,
          status: status || "draft",
          updated_at: db.fn.now(),
        });

      console.log("Update result - affected rows:", affectedRows);

      if (affectedRows === 0) {
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

      await db("questionnaire_config").insert({
        id: newId,
        title,
        description: description || null,
        questions: JSON.stringify(surveyJSON),
        logo: logo || null,
        status: status || "draft",
        created_by: createdBy || null,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

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
    let query = db("questionnaire_config").select("*");

    if (status) {
      query = query.where("status", status);
    }

    query = query.orderBy("created_at", "desc");

    console.log("Executing query with Knex");
    const rows = await query;
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
    const userSubscriptions = await db("user_subscriptions as us")
      .select("us.plan_id", "sp.name as plan_name")
      .join("subscription_plans as sp", "us.plan_id", "sp.id")
      .where("us.user_id", userId)
      .where("us.status", "active")
      .orderBy("us.created_at", "desc")
      .limit(1);

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
    const questionnaires = await db("questionnaire_config as qc")
      .select(
        "qc.id",
        "qc.title",
        "qc.description",
        "qc.status",
        "qc.logo",
        "qc.created_at",
        "qc.updated_at",
        "pq.sequence_order"
      )
      .join("plan_questionnaires as pq", "qc.id", "pq.questionnaire_id")
      .where("pq.plan_id", userPlan.plan_id)
      .where("qc.status", "published")
      .orderBy("pq.sequence_order", "asc")
      .orderBy("qc.created_at", "desc");

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
    const subs = await db("user_subscriptions as us")
      .select(
        "us.id as subscription_id",
        "us.user_id",
        "us.plan_id",
        "us.started_at",
        "us.expires_at",
        "us.status",
        "sp.name as plan_name",
        "sp.description as plan_description",
        "sp.price",
        "sp.is_free",
        "sp.plan_type",
        "sp.features"
      )
      .join("subscription_plans as sp", "us.plan_id", "sp.id")
      .where("us.user_id", userId)
      .where("us.status", "active")
      .orderBy("us.started_at", "desc")
      .limit(1);

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
    const questions = await db("plan_questionnaires as pq")
      .select(
        "pq.questionnaire_id as id",
        "qc.title as name",
        "qc.description",
        "pq.sequence_order"
      )
      .join("questionnaire_config as qc", "pq.questionnaire_id", "qc.id")
      .where("pq.plan_id", subscription.plan_id)
      .where("qc.status", "published")
      .orderBy("pq.sequence_order", "asc");

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
    const rows = await db("questionnaire_config")
      .where("id", req.params.id);

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
    const rows = await db("questionnaire_config")
      .where("id", id);
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
    const checkRows = await db("questionnaire_config")
      .select("id", "title")
      .where("id", id);

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
    const affectedRows = await db("questionnaire_config")
      .where("id", id)
      .delete();

    console.log("Delete result - affected rows:", affectedRows);

    if (affectedRows === 0) {
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

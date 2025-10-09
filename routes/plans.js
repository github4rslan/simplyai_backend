import express from "express";
import { pool } from "../db.js";
import crypto from "crypto";

const router = express.Router();

// Get all subscription plans
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM subscription_plans WHERE active = 1 ORDER BY sort_order ASC, created_at DESC"
    );

    const plans = rows.map((plan) => ({
      ...plan,
      features:
        typeof plan.features === "string"
          ? JSON.parse(plan.features || "[]")
          : plan.features,
      options:
        typeof plan.options === "string"
          ? JSON.parse(plan.options || "{}")
          : plan.options,
      // Convert tinyint to boolean for consistency
      is_popular: Boolean(plan.is_popular),
      is_free: Boolean(plan.is_free),
      active: Boolean(plan.active),
    }));

    res.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error("Error fetching plans:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch plans",
    });
  }
});

// Get all subscription plans for admin (includes inactive)
router.get("/admin/all", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM subscription_plans ORDER BY sort_order ASC, created_at DESC"
    );

    const plans = rows.map((plan) => ({
      ...plan,
      features:
        typeof plan.features === "string"
          ? JSON.parse(plan.features || "[]")
          : plan.features,
      options:
        typeof plan.options === "string"
          ? JSON.parse(plan.options || "{}")
          : plan.options,
      // Convert tinyint to boolean for consistency
      is_popular: Boolean(plan.is_popular),
      is_free: Boolean(plan.is_free),
      active: Boolean(plan.active),
    }));

    res.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error("Error fetching all plans for admin:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch all plans",
    });
  }
});

// Get single plan by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      "SELECT * FROM subscription_plans WHERE id = ? AND active = 1",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    const plan = rows[0];
    plan.features =
      typeof plan.features === "string"
        ? JSON.parse(plan.features || "[]")
        : plan.features;
    plan.options =
      typeof plan.options === "string"
        ? JSON.parse(plan.options || "{}")
        : plan.options;
    // Convert tinyint to boolean for consistency
    plan.is_popular = Boolean(plan.is_popular);
    plan.is_free = Boolean(plan.is_free);
    plan.active = Boolean(plan.active);

    res.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error("Error fetching plan:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch plan",
    });
  }
});

// Get single plan by ID for admin (includes inactive)
router.get("/admin/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      "SELECT * FROM subscription_plans WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    const plan = rows[0];
    plan.features =
      typeof plan.features === "string"
        ? JSON.parse(plan.features || "[]")
        : plan.features;
    plan.options =
      typeof plan.options === "string"
        ? JSON.parse(plan.options || "{}")
        : plan.options;
    // Convert tinyint to boolean for consistency
    plan.is_popular = Boolean(plan.is_popular);
    plan.is_free = Boolean(plan.is_free);
    plan.active = Boolean(plan.active);

    res.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error("Error fetching plan for admin:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch plan",
    });
  }
});

// Create or update a plan (POST)
router.post("/", async (req, res) => {
  try {
    const {
      id,
      name,
      description,
      price,
      is_free,
      features,
      active,
      button_text,
      button_variant,
      sort_order,
      is_popular,
      created_at,
      updated_at,
      plan_type,
      options,
    } = req.body;
    const interval = req.body.interval;

    console.log("=== Creating new plan ===");
    console.log("Request body:", req.body);

    // Validate required fields
    if (!id || !name) {
      return res.status(400).json({
        success: false,
        message: "ID and name are required fields",
        missing: { id: !id, name: !name },
      });
    }

    // Test database connection first
    try {
      await pool.query("SELECT 1");
      console.log("Database connection successful");
    } catch (dbError) {
      console.error("Database connection failed:", dbError);
      return res.status(500).json({
        success: false,
        message: "Database connection failed",
        error: dbError.message,
      });
    }

    const query = `
      INSERT INTO subscription_plans (id, name, description, price, is_free, features, active, button_text, button_variant, sort_order, \`interval\`, is_popular, created_at, updated_at, plan_type, options)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const queryParams = [
      id,
      name,
      description || "",
      price || 0,
      is_free ? 1 : 0,
      JSON.stringify(features || []),
      active ? 1 : 0,
      button_text || "",
      button_variant || "",
      sort_order || 0,
      interval || "month",
      is_popular ? 1 : 0,
      created_at,
      updated_at,
      plan_type || "single",
      JSON.stringify(options || {}),
    ];

    console.log("Executing query:", query);
    console.log("Query parameters:", queryParams);

    const [result] = await pool.execute(query, queryParams);

    console.log("Database operation result:", result);
    console.log("Affected rows:", result.affectedRows);
    console.log("Insert ID:", result.insertId);

    // Verify the insert by selecting the created record
    const [verifyResult] = await pool.query(
      "SELECT * FROM subscription_plans WHERE id = ?",
      [id]
    );
    console.log("Verification query result:", verifyResult);

    res.json({
      success: true,
      message: "Plan created successfully",
      debug: {
        requestBody: req.body,
        dbResult: result,
        affectedRows: result.affectedRows,
        insertId: result.insertId,
        verificationResult: verifyResult,
      },
    });
  } catch (error) {
    console.error("Error creating plan:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create plan",
      error: error.message,
      stack: error.stack,
    });
  }
});

// Update a plan (PUT)
router.put("/:id", async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      is_free,
      features,
      active,
      button_text,
      button_variant,
      sort_order,
      is_popular,
      updated_at,
      plan_type,
      options,
    } = req.body;
    const interval = req.body.interval;

    const { id } = req.params;

    console.log("=== Updating existing plan ===");
    console.log("Plan ID:", id);
    console.log("Request body:", req.body);

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Plan ID is required" });
    }

    // Check if plan exists
    const [existingPlan] = await pool.query(
      "SELECT * FROM subscription_plans WHERE id = ?",
      [id]
    );
    if (existingPlan.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });
    }

    const query = `UPDATE subscription_plans SET 
      name = ?, description = ?, price = ?, is_free = ?, features = ?, active = ?, 
      button_text = ?, button_variant = ?, sort_order = ?, \`interval\` = ?, is_popular = ?, updated_at = ?, plan_type = ?, options = ?
      WHERE id = ?`;

    // Convert ISO string to MySQL datetime format
    const mysqlDateTime = new Date(updated_at || new Date())
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const queryParams = [
      name,
      description || "",
      price || 0,
      is_free ? 1 : 0,
      JSON.stringify(features || []),
      active ? 1 : 0,
      button_text || "",
      button_variant || "",
      sort_order || 0,
      interval || "month",
      is_popular ? 1 : 0,
      mysqlDateTime,
      plan_type || "single",
      JSON.stringify(options || {}),
      id,
    ];

    console.log("Executing update query:", query);
    console.log("Query parameters:", queryParams);

    const [result] = await pool.execute(query, queryParams);

    console.log("Database update result:", result);
    console.log("Affected rows:", result.affectedRows);

    // Verify the update by selecting the updated record
    const [verifyResult] = await pool.query(
      "SELECT * FROM subscription_plans WHERE id = ?",
      [id]
    );
    console.log("Verification query result:", verifyResult);

    res.json({
      success: true,
      message: "Plan updated successfully",
      debug: {
        requestBody: req.body,
        dbResult: result,
        affectedRows: result.affectedRows,
        verificationResult: verifyResult,
      },
    });
  } catch (error) {
    console.error("Error updating plan:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update plan",
      error: error.message,
      stack: error.stack,
    });
  }
});

// Delete a plan
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      "DELETE FROM subscription_plans WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    res.json({
      success: true,
      message: "Plan deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting plan:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete plan",
    });
  }
});

// Get plan settings
router.get("/:id/settings", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      "SELECT * FROM plan_settings WHERE plan_id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Plan settings not found",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Error fetching plan settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch plan settings",
    });
  }
});

// Save plan settings
router.post("/:id/settings", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      is_free,
      can_retake,
      retake_period_days,
      retake_limit,
      is_sequential,
      is_progress_tracking,
      is_periodic,
    } = req.body;

    const [existing] = await pool.query(
      "SELECT * FROM plan_settings WHERE plan_id = ?",
      [id]
    );

    const settingsData = {
      plan_id: id,
      is_free: Boolean(is_free),
      can_retake: Boolean(can_retake),
      retake_period_days: retake_period_days || 90,
      retake_limit: retake_limit || 4,
      is_sequential: Boolean(is_sequential),
      is_progress_tracking: Boolean(is_progress_tracking),
      is_periodic: Boolean(is_periodic),
      updated_at: new Date(),
    };

    if (existing.length > 0) {
      await pool.query(
        `UPDATE plan_settings 
         SET is_free = ?, can_retake = ?, retake_period_days = ?, retake_limit = ?,
             is_sequential = ?, is_progress_tracking = ?, is_periodic = ?, updated_at = ?
         WHERE plan_id = ?`,
        [
          settingsData.is_free,
          settingsData.can_retake,
          settingsData.retake_period_days,
          settingsData.retake_limit,
          settingsData.is_sequential,
          settingsData.is_progress_tracking,
          settingsData.is_periodic,
          settingsData.updated_at,
          id,
        ]
      );
    } else {
      settingsData.created_at = new Date();
      await pool.query(
        `INSERT INTO plan_settings 
         (plan_id, is_free, can_retake, retake_period_days, retake_limit,
          is_sequential, is_progress_tracking, is_periodic, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          settingsData.plan_id,
          settingsData.is_free,
          settingsData.can_retake,
          settingsData.retake_period_days,
          settingsData.retake_limit,
          settingsData.is_sequential,
          settingsData.is_progress_tracking,
          settingsData.is_periodic,
          settingsData.created_at,
          settingsData.updated_at,
        ]
      );
    }

    res.json({
      success: true,
      message: "Plan settings saved successfully",
      data: settingsData,
    });
  } catch (error) {
    console.error("Error saving plan settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save plan settings",
    });
  }
});

// Get questionnaires for a specific plan
router.get("/:id/questionnaires", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Fetching plan questionnaires for plan:", id);

    const [rows] = await pool.query(
      `
      SELECT 
        pq.id as plan_questionnaire_id,
        pq.questionnaire_id,
        pq.sequence_order,
        qc.title,
        qc.description,
        qc.status
      FROM plan_questionnaires pq
      JOIN questionnaire_config qc ON pq.questionnaire_id = qc.id
      WHERE pq.plan_id = ?
      ORDER BY pq.sequence_order ASC
    `,
      [id]
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching plan questionnaires:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch plan questionnaires",
    });
  }
});

// Update questionnaires for a specific plan
router.put("/:id/questionnaires", async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const { questionnaires } = req.body;

    console.log("Updating plan questionnaires for plan:", id);
    console.log("Questionnaires data:", questionnaires);

    await connection.beginTransaction();

    // First, delete existing plan questionnaires
    await connection.query(
      "DELETE FROM plan_questionnaires WHERE plan_id = ?",
      [id]
    );

    // Then, insert new questionnaires if any
    if (questionnaires && questionnaires.length > 0) {
      for (let i = 0; i < questionnaires.length; i++) {
        const questionnaire = questionnaires[i];
        await connection.query(
          `
          INSERT INTO plan_questionnaires (plan_id, questionnaire_id, sequence_order)
          VALUES (?, ?, ?)
        `,
          [id, questionnaire.id, questionnaire.sequence || i + 1]
        );
      }
    }

    await connection.commit();

    res.json({
      success: true,
      message: "Plan questionnaires updated successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error updating plan questionnaires:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update plan questionnaires",
    });
  } finally {
    connection.release();
  }
});

export default router;

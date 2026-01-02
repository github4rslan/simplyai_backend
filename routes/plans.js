import express from "express";
import { db } from "../config/knex.js";
import { planModel } from "../models/index.js";
import crypto from "crypto";

const router = express.Router();

// Normalize booleans that may arrive as strings/numbers/null
const toBool = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(lowered)) return true;
    if (["false", "0", "no", "n", "off"].includes(lowered)) return false;
  }
  return Boolean(value);
};

// Normalize numeric values (price, sort order, etc.)
const toNumber = (value, defaultValue = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
};

// Ensure the subscription_plans table has the columns we write to
let ensurePlanSchemaPromise;
const ensurePlanSchema = async () => {
  if (!ensurePlanSchemaPromise) {
    ensurePlanSchemaPromise = (async () => {
      const hasPlanType = await db.schema.hasColumn("subscription_plans", "plan_type");
      if (!hasPlanType) {
        await db.schema.alterTable("subscription_plans", (table) => {
          table.string("plan_type", 50).defaultTo("single");
        });
        console.log("Added subscription_plans.plan_type column");
      }

      const hasOptions = await db.schema.hasColumn("subscription_plans", "options");
      if (!hasOptions) {
        await db.schema.alterTable("subscription_plans", (table) => {
          table.json("options").nullable();
        });
        console.log("Added subscription_plans.options column");
      }

      const hasDeletedAt = await db.schema.hasColumn("subscription_plans", "deleted_at");
      if (!hasDeletedAt) {
        await db.schema.alterTable("subscription_plans", (table) => {
          table.timestamp("deleted_at").nullable();
        });
        console.log("Added subscription_plans.deleted_at column");
      }
    })().catch((err) => {
      ensurePlanSchemaPromise = null;
      throw err;
    });
  }

  return ensurePlanSchemaPromise;
};

// Helper function to normalize plan data
const normalizePlan = (plan) => ({
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
});

// Get all subscription plans
router.get("/", async (req, res) => {
  try {
    const rows = await db("subscription_plans")
      .where("active", 1)
      .whereNull("deleted_at")
      .orderBy("sort_order", "asc")
      .orderBy("created_at", "desc");

    const plans = rows.map(normalizePlan);

    res.success("Plans retrieved successfully", plans);
  } catch (error) {
    console.error("Error fetching plans:", error);
    res.fail(500, "Failed to fetch plans", { error: error.message });
  }
});

// Get all subscription plans for admin (includes inactive)
router.get("/admin/all", async (req, res) => {
  try {
    const rows = await db("subscription_plans")
      .whereNull("deleted_at")
      .orderBy("sort_order", "asc")
      .orderBy("created_at", "desc");

    const plans = rows.map(normalizePlan);

    res.success("All plans retrieved successfully", plans);
  } catch (error) {
    console.error("Error fetching all plans for admin:", error);
    res.fail(500, "Failed to fetch all plans", { error: error.message });
  }
});

// Get single plan by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await db("subscription_plans")
      .where({ id })
      .where("active", 1)
      .whereNull("deleted_at")
      .first();

    if (!plan) {
      return res.fail(404, "Plan not found");
    }

    const normalizedPlan = normalizePlan(plan);
    res.success("Plan retrieved successfully", normalizedPlan);
  } catch (error) {
    console.error("Error fetching plan:", error);
    res.fail(500, "Failed to fetch plan", { error: error.message });
  }
});

// Get single plan by ID for admin (includes inactive)
router.get("/admin/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await db("subscription_plans")
      .where({ id })
      .whereNull("deleted_at")
      .first();

    if (!plan) {
      return res.fail(404, "Plan not found");
    }

    const normalizedPlan = normalizePlan(plan);
    res.success("Plan retrieved successfully", normalizedPlan);
  } catch (error) {
    console.error("Error fetching plan for admin:", error);
    res.fail(500, "Failed to fetch plan", { error: error.message });
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

    // Ensure we have an ID; generate one if missing
    const planId = id || crypto.randomUUID();
    await ensurePlanSchema();

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Plan name is required",
        missing: { name: !name },
      });
    }

    // Test database connection first
    try {
      await db.raw("SELECT 1");
      console.log("Database connection successful");
    } catch (dbError) {
      console.error("Database connection failed:", dbError);
      return res.fail(500, "Database connection failed", { error: dbError.message });
    }

    // Prepare data for insertion
    const planData = {
      id: planId,
      name,
      description: description || "",
      price: toNumber(price, 0),
      is_free: toBool(is_free, false) ? 1 : 0,
      features: JSON.stringify(features ?? []),
      // Default to active so the plan appears in pricing unless explicitly disabled
      active: toBool(active, true) ? 1 : 0,
      button_text: button_text || "",
      button_variant: button_variant || "",
      sort_order: toNumber(sort_order, 0),
      interval: interval || "month",
      is_popular: toBool(is_popular, false) ? 1 : 0,
      created_at: created_at || new Date(),
      updated_at: updated_at || new Date(),
      plan_type: plan_type || "single",
      options: JSON.stringify(options ?? {}),
    };

    console.log("Inserting plan with Knex:", planData);

    // Insert using Knex
    await db("subscription_plans").insert(planData);

    // Verify the insert by selecting the created record
    const verifyResult = await db("subscription_plans").where("id", planId).first();
    console.log("Verification query result:", verifyResult);

    const normalizedPlan = normalizePlan(verifyResult);

    res.success("Plan created successfully", normalizedPlan);
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
    const existingPlan = await db("subscription_plans")
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!existingPlan) {
      return res.fail(404, "Plan not found");
    }

    await ensurePlanSchema();

    // Prepare update data
    const updateData = {
      name: name ?? existingPlan.name,
      description: description ?? existingPlan.description ?? "",
      price: price !== undefined ? toNumber(price, existingPlan.price) : existingPlan.price,
      is_free: toBool(is_free, existingPlan.is_free) ? 1 : 0,
      features:
        features !== undefined
          ? JSON.stringify(features ?? [])
          : existingPlan.features,
      active: toBool(active, existingPlan.active) ? 1 : 0,
      button_text: button_text ?? existingPlan.button_text ?? "",
      button_variant: button_variant ?? existingPlan.button_variant ?? "",
      sort_order: sort_order !== undefined ? toNumber(sort_order, existingPlan.sort_order) : existingPlan.sort_order,
      interval: interval || existingPlan.interval || "month",
      is_popular: toBool(is_popular, existingPlan.is_popular) ? 1 : 0,
      updated_at: updated_at || new Date(),
      plan_type: plan_type || existingPlan.plan_type || "single",
      options:
        options !== undefined
          ? JSON.stringify(options ?? {})
          : existingPlan.options ?? JSON.stringify({}),
    };

    console.log("Updating plan with Knex:", { id, updateData });

    // Update using Knex
    const affectedRows = await db("subscription_plans").where("id", id).update(updateData);

    console.log("Database update result - affected rows:", affectedRows);

    // Verify the update by selecting the updated record
    const verifyResult = await db("subscription_plans").where("id", id).first();
    console.log("Verification query result:", verifyResult);

    const normalizedPlan = normalizePlan(verifyResult);

    res.success("Plan updated successfully", normalizedPlan);
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

    // Check if plan exists first
    const existingPlan = await db("subscription_plans")
      .where("id", id)
      .whereNull("deleted_at")
      .first();
    if (!existingPlan) {
      return res.fail(404, "Plan not found");
    }

    // Soft delete to avoid FK issues; also deactivate
    await db("subscription_plans")
      .where("id", id)
      .update({ active: 0, deleted_at: new Date(), updated_at: new Date() });

    res.success("Plan deleted successfully");
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
    const settings = await db("plan_settings").where("plan_id", id).first();

    if (!settings) {
      return res.fail(404, "Plan settings not found");
    }

    res.success("Plan settings retrieved", settings);
  } catch (error) {
    console.error("Error fetching plan settings:", error);
    res.fail(500, "Failed to fetch plan settings", { error: error.message });
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

    const existing = await db("plan_settings").where("plan_id", id).first();

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

    if (existing) {
      // Update existing settings
      await db("plan_settings").where("plan_id", id).update(settingsData);
    } else {
      // Insert new settings
      settingsData.created_at = new Date();
      await db("plan_settings").insert(settingsData);
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

    const rows = await db("plan_questionnaires as pq")
      .select(
        "pq.id as plan_questionnaire_id",
        "pq.questionnaire_id",
        "pq.sequence_order",
        "qc.title",
        "qc.description",
        "qc.status"
      )
      .join("questionnaire_config as qc", "pq.questionnaire_id", "qc.id")
      .where("pq.plan_id", id)
      .orderBy("pq.sequence_order", "asc");

    res.success("Plan questionnaires retrieved", rows);
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
  const trx = await db.transaction();

  try {
    const { id } = req.params;
    const { questionnaires } = req.body;

    console.log("Updating plan questionnaires for plan:", id);
    console.log("Questionnaires data:", questionnaires);

    // First, delete existing plan questionnaires
    await trx("plan_questionnaires").where("plan_id", id).delete();

    // Then, insert new questionnaires if any
    if (questionnaires && questionnaires.length > 0) {
      const insertData = questionnaires.map((questionnaire, index) => ({
        plan_id: id,
        questionnaire_id: questionnaire.id,
        sequence_order: questionnaire.sequence || index + 1,
      }));

      await trx("plan_questionnaires").insert(insertData);
    }

    await trx.commit();

    res.success("Plan questionnaires updated successfully");
  } catch (error) {
    await trx.rollback();
    console.error("Error updating plan questionnaires:", error);
    res.fail(500, "Failed to update plan questionnaires", { error: error.message });
  }
});

export default router;

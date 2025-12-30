import { pool } from "./db.js";

async function columnExists(table, column) {
  const [rows] = await pool.query("SHOW COLUMNS FROM ?? LIKE ?", [
    table,
    column,
  ]);
  return rows.length > 0;
}

async function ensureColumn(table, column, definition) {
  const exists = await columnExists(table, column);
  if (exists) {
    console.log(`ℹ️ Column ${table}.${column} already exists.`);
    return;
  }

  console.log(`➕ Adding column ${table}.${column}...`);
  await pool.query(`ALTER TABLE ?? ADD COLUMN ${definition}`, [table]);
  console.log(`✅ Added column ${table}.${column}`);
}

async function run() {
  try {
    console.log("🔧 Ensuring questionnaire-related columns...");

    // subscription_plans.options JSON
    await ensureColumn(
      "subscription_plans",
      "plan_type",
      "plan_type VARCHAR(50) NULL DEFAULT 'single' AFTER is_popular"
    );

    await ensureColumn(
      "subscription_plans",
      "options",
      "options JSON NULL AFTER features"
    );

    // user_subscriptions progress tracking columns
    await ensureColumn(
      "user_subscriptions",
      "current_sequence",
      "current_sequence INT NULL DEFAULT 0 AFTER started_at"
    );

    await ensureColumn(
      "user_subscriptions",
      "current_attempt",
      "current_attempt INT NULL DEFAULT 1 AFTER current_sequence"
    );

    await ensureColumn(
      "user_subscriptions",
      "last_completed_questionnaire_id",
      "last_completed_questionnaire_id CHAR(36) NULL AFTER current_attempt"
    );

    // questionnaire_responses relational columns
    await ensureColumn(
      "questionnaire_responses",
      "subscription_id",
      "subscription_id CHAR(36) NULL AFTER user_id"
    );

    await ensureColumn(
      "questionnaire_responses",
      "plan_id",
      "plan_id CHAR(36) NULL AFTER subscription_id"
    );

    await ensureColumn(
      "questionnaire_responses",
      "attempt_number",
      "attempt_number INT NULL DEFAULT 1 AFTER plan_id"
    );

    console.log("🎉 Questionnaire columns are ready.");
  } catch (error) {
    console.error("❌ Failed to ensure questionnaire columns:", error.message);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();


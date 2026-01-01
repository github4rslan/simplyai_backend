import { pool } from "../db.js";

/**
 * Adds a plan_id column to report_templates if it doesn't exist.
 */
async function main() {
  const conn = await pool.getConnection();
  try {
    // Check if column exists
    const [cols] = await conn.query(
      `SHOW COLUMNS FROM report_templates LIKE 'plan_id'`
    );

    if (cols.length === 0) {
      console.log("Adding plan_id column to report_templates...");
      await conn.query(
        `ALTER TABLE report_templates
         ADD COLUMN plan_id CHAR(36) NULL AFTER user_id`
      );
      console.log("✅ plan_id column added");
    } else {
      console.log("plan_id column already exists, skipping");
    }

    // Add a helpful index if missing
    try {
      await conn.query(
        `CREATE INDEX idx_report_templates_plan ON report_templates (plan_id)`
      );
      console.log("✅ Index idx_report_templates_plan created");
    } catch (err) {
      if (err.code === "ER_DUP_KEYNAME") {
        console.log("Index idx_report_templates_plan already exists, skipping");
      } else {
        throw err;
      }
    }
  } finally {
    conn.release();
  }
}

main()
  .then(() => {
    console.log("Migration completed");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });

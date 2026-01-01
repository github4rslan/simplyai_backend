import { pool } from "../db.js";

/**
 * Adds missing columns to the reports table:
 * - questionnaire_response_id (CHAR(36) NULL)
 * - ai_response (JSON NULL)
 * - plan_id (CHAR(36) NULL) to future-proof per-plan reports
 */
async function main() {
  const conn = await pool.getConnection();
  try {
    // questionnaire_response_id
    const [qrCol] = await conn.query(
      `SHOW COLUMNS FROM reports LIKE 'questionnaire_response_id'`
    );
    if (qrCol.length === 0) {
      console.log("Adding questionnaire_response_id to reports...");
      await conn.query(
        `ALTER TABLE reports ADD COLUMN questionnaire_response_id CHAR(36) NULL AFTER user_id`
      );
    } else {
      console.log("questionnaire_response_id already exists, skipping");
    }

    // ai_response
    const [aiCol] = await conn.query(
      `SHOW COLUMNS FROM reports LIKE 'ai_response'`
    );
    if (aiCol.length === 0) {
      console.log("Adding ai_response to reports...");
      await conn.query(
        `ALTER TABLE reports ADD COLUMN ai_response JSON NULL AFTER pdf_url`
      );
    } else {
      console.log("ai_response already exists, skipping");
    }

    // plan_id
    const [planCol] = await conn.query(
      `SHOW COLUMNS FROM reports LIKE 'plan_id'`
    );
    if (planCol.length === 0) {
      console.log("Adding plan_id to reports...");
      await conn.query(
        `ALTER TABLE reports ADD COLUMN plan_id CHAR(36) NULL AFTER questionnaire_id`
      );
      try {
        await conn.query(
          `CREATE INDEX idx_reports_plan ON reports (plan_id)`
        );
      } catch (err) {
        if (err.code === "ER_DUP_KEYNAME") {
          console.log("idx_reports_plan already exists, skipping");
        } else {
          throw err;
        }
      }
    } else {
      console.log("plan_id already exists, skipping");
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

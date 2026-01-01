import { pool } from "../db.js";

async function addIndex() {
  const indexName = "idx_user_subscriptions_user_status";
  const sql = `CREATE INDEX ${indexName} ON user_subscriptions (user_id, status)`;

  try {
    console.log(`Adding index ${indexName} on user_subscriptions (user_id, status)...`);
    await pool.query(sql);
    console.log(`Index ${indexName} created.`);
  } catch (error) {
    if (error.code === "ER_DUP_KEYNAME") {
      console.log(`Index ${indexName} already exists, skipping.`);
    } else {
      console.error(`Failed to create index ${indexName}:`, error.message);
    }
  } finally {
    await pool.end();
  }
}

addIndex();

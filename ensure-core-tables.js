import { pool } from "./db.js";

async function ensureAuthTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS auth (
      user_id CHAR(36) NOT NULL,
      password_hash VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("✅ auth table verified");
}

async function ensurePagesTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS pages (
      id VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      content JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY unique_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("✅ pages table verified");
}

async function run() {
  try {
    console.log("🔧 Ensuring core tables exist...");
    await ensureAuthTable();
    await ensurePagesTable();
    console.log("🎉 Core tables are ready.");
  } catch (error) {
    console.error("❌ Failed to ensure core tables:", error.message);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();


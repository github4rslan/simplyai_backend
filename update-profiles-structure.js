import { pool } from "./db.js";

const COLUMN_DEFINITIONS = [
  {
    name: "email",
    definition: "VARCHAR(255) NOT NULL",
    position: "AFTER id",
  },
  {
    name: "full_name",
    definition: "VARCHAR(255) DEFAULT NULL",
    position: "AFTER last_name",
  },
  {
    name: "auth_provider",
    definition: "VARCHAR(50) NOT NULL DEFAULT 'email'",
    position: "AFTER phone",
  },
  {
    name: "google_id",
    definition: "VARCHAR(255) DEFAULT NULL",
    position: "AFTER auth_provider",
  },
  {
    name: "facebook_id",
    definition: "VARCHAR(255) DEFAULT NULL",
    position: "AFTER google_id",
  },
  {
    name: "is_admin",
    definition: "TINYINT(1) NOT NULL DEFAULT 0",
    position: "AFTER role",
  },
  {
    name: "last_activity",
    definition: "TIMESTAMP NULL DEFAULT NULL",
    position: "AFTER updated_at",
  },
];

const indexes = [
  {
    name: "unique_email",
    definition: "UNIQUE KEY unique_email (email)",
  },
  {
    name: "unique_google_id",
    definition: "UNIQUE KEY unique_google_id (google_id)",
  },
  {
    name: "unique_facebook_id",
    definition: "UNIQUE KEY unique_facebook_id (facebook_id)",
  },
];

async function columnExists(column) {
  const [rows] = await pool.query("SHOW COLUMNS FROM profiles LIKE ?", [
    column,
  ]);
  return rows.length > 0;
}

async function indexExists(indexName) {
  const [rows] = await pool.query("SHOW INDEX FROM profiles WHERE Key_name = ?", [
    indexName,
  ]);
  return rows.length > 0;
}

async function ensureColumns() {
  for (const column of COLUMN_DEFINITIONS) {
    const exists = await columnExists(column.name);
    if (exists) {
      console.log(`ℹ️ Column "${column.name}" already exists.`);
      continue;
    }

    console.log(`➕ Adding column "${column.name}" to profiles...`);
    await pool.query(
      `ALTER TABLE profiles ADD COLUMN ${column.name} ${column.definition} ${column.position}`
    );
    console.log(`✅ Added column "${column.name}"`);
  }
}

async function ensureIndexes() {
  for (const index of indexes) {
    const exists = await indexExists(index.name);
    if (exists) {
      console.log(`ℹ️ Index "${index.name}" already exists.`);
      continue;
    }

    console.log(`➕ Creating index "${index.name}"...`);
    await pool.query(`ALTER TABLE profiles ADD ${index.definition}`);
    console.log(`✅ Index "${index.name}" created.`);
  }
}

async function run() {
  try {
    console.log("🔧 Ensuring profiles table structure...");
    await ensureColumns();
    await ensureIndexes();
    console.log("🎉 Profiles table structure is up to date.");
  } catch (error) {
    console.error("❌ Failed to update profiles table:", error.message);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();


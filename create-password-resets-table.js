import { pool } from "./db.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    console.log("Creating password_resets table...");

    const migrationSQL = readFileSync(
      join(__dirname, "migrations", "create_password_resets_table.sql"),
      "utf8"
    );

    await pool.execute(migrationSQL);
    console.log("✅ password_resets table created successfully");

    // Test the table
    const [result] = await pool.execute("DESCRIBE password_resets");
    console.log("Table structure:", result);
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await pool.end();
  }
}

runMigration();

import { pool } from "./db.js";

async function checkDatabase() {
  try {
    console.log("Environment variables:");
    console.log("DB_HOST:", process.env.DB_HOST);
    console.log("DB_USER:", process.env.DB_USER);
    console.log(
      "DB_PASSWORD:",
      process.env.DB_PASSWORD ? "[SET]" : "[NOT SET]"
    );
    console.log("DB_NAME:", process.env.DB_NAME);
    console.log("DB_PORT:", process.env.DB_PORT);

    console.log("\nTesting database connection...");
    const [result] = await pool.query("SELECT DATABASE() as current_db");
    console.log("Current database:", result[0]);

    console.log("\nChecking if password_resets table exists...");
    const [tables] = await pool.query('SHOW TABLES LIKE "password_resets"');
    console.log(
      "password_resets table exists:",
      tables.length > 0 ? "✅" : "❌"
    );

    if (tables.length === 0) {
      console.log("\nShowing all tables in current database:");
      const [allTables] = await pool.query("SHOW TABLES");
      console.log("Tables:", allTables);
    }
  } catch (error) {
    console.error("❌ Database check error:", error.message);
  } finally {
    await pool.end();
  }
}

checkDatabase();

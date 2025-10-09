import { pool } from "./db.js";

async function checkTables() {
  try {
    console.log("Checking profiles table structure...");
    const [profilesResult] = await pool.execute("DESCRIBE profiles");
    console.log("Profiles table:", profilesResult);

    console.log("\nChecking auth table structure...");
    const [authResult] = await pool.execute("DESCRIBE auth");
    console.log("Auth table:", authResult);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await pool.end();
  }
}

checkTables();

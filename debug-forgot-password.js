import { pool } from "./db.js";

async function debugForgotPassword() {
  try {
    console.log("Testing database connection...");

    // Test basic connection
    const [connectionTest] = await pool.query("SELECT 1 as test");
    console.log("✅ Database connection working:", connectionTest);

    // Test profiles table
    console.log("\nTesting profiles query...");
    const [users] = await pool.query(
      `SELECT p.id AS user_id, p.email FROM profiles p JOIN auth a ON p.id = a.user_id WHERE p.email = ?`,
      ["test@example.com"]
    );
    console.log("Users found:", users);

    // Check if we have any users at all
    console.log("\nChecking all users in profiles...");
    const [allUsers] = await pool.query(
      "SELECT id, email FROM profiles LIMIT 5"
    );
    console.log("All users (first 5):", allUsers);

    // Check password_resets table
    console.log("\nTesting password_resets table...");
    const [resets] = await pool.query("SELECT * FROM password_resets LIMIT 1");
    console.log(
      "Password resets table accessible:",
      resets.length >= 0 ? "✅" : "❌"
    );
  } catch (error) {
    console.error("❌ Debug error:", error);
  } finally {
    await pool.end();
  }
}

debugForgotPassword();

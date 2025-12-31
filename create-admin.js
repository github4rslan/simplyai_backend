import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

const config = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "defaultdb",
  connectTimeout: 15000,
};

async function createOrUpdateAdmin() {
  let connection;

  // Admin credentials
  const adminEmail = "admin@simpolyai.com";
  const adminPassword = "Admin123!";

  try {
    console.log("Connessione al database...");
    connection = await mysql.createConnection(config);

    // 1) Find existing profile by email
    const [profiles] = await connection.execute(
      "SELECT id, email, is_admin, role FROM profiles WHERE email = ? LIMIT 1",
      [adminEmail]
    );

    let userId;

    if (profiles.length > 0) {
      userId = profiles[0].id;
      console.log(`✅ Admin profile exists. ID: ${userId}`);

      // Update admin flags
      await connection.execute(
        "UPDATE profiles SET is_admin = TRUE, role = 'administrator', full_name = 'Administrator', updated_at = NOW() WHERE id = ?",
        [userId]
      );
      console.log("✅ Admin profile updated (is_admin/role/full_name).");
    } else {
      // Create profile row (IMPORTANT: id is NOT NULL in your schema)
      userId = uuidv4();

      await connection.execute(
        `INSERT INTO profiles (
          id, email, full_name, auth_provider, role, is_admin, created_at, updated_at
        ) VALUES (
          ?, ?, ?, 'email', 'administrator', TRUE, NOW(), NOW()
        )`,
        [userId, adminEmail, "Administrator"]
      );

      console.log(`✅ Admin profile created. ID: ${userId}`);
    }

    // 2) Upsert auth record (password hash)
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Check if auth table exists (optional safety)
    const [authTable] = await connection.execute(
      "SHOW TABLES LIKE 'auth'"
    );

    if (authTable.length === 0) {
      console.log("⚠️ Table 'auth' not found. Skipping password creation.");
      console.log("   Your login system may be using a different table for passwords.");
      return;
    }

    const [authRows] = await connection.execute(
      "SELECT user_id FROM auth WHERE user_id = ? LIMIT 1",
      [userId]
    );

    if (authRows.length > 0) {
      await connection.execute(
        "UPDATE auth SET password_hash = ?, updated_at = NOW() WHERE user_id = ?",
        [hashedPassword, userId]
      );
      console.log("✅ Admin password updated in auth table.");
    } else {
      await connection.execute(
        "INSERT INTO auth (user_id, password_hash, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
        [userId, hashedPassword]
      );
      console.log("✅ Admin auth record created.");
    }

    // 3) Final check
    const [finalCheck] = await connection.execute(
      `SELECT p.id, p.email, p.full_name, p.is_admin, p.role
       FROM profiles p
       WHERE p.email = ?`,
      [adminEmail]
    );

    console.log("\n📋 Admin created/verified:");
    console.log(finalCheck[0]);
    console.log("\n🔑 Login credentials:");
    console.log("Email:", adminEmail);
    console.log("Password:", adminPassword);

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    if (connection) await connection.end();
  }
}

createOrUpdateAdmin();

import { pool } from "./db.js";

async function createPasswordResetsTableSimple() {
  try {
    console.log(
      "Creating password_resets table without foreign key constraint..."
    );

    // Drop the table if it exists
    await pool.execute("DROP TABLE IF EXISTS password_resets");

    // Create the table with correct data types but no foreign key
    const createTableSQL = `
      CREATE TABLE password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_token_hash (token_hash),
        INDEX idx_expires_at (expires_at)
      )
    `;

    await pool.execute(createTableSQL);
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

createPasswordResetsTableSimple();

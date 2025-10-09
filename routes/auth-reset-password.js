// backend/routes/auth-reset-password.js
import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";

const router = express.Router();

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  const { userId, token, newPassword } = req.body;
  if (!userId || !token || !newPassword) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required fields" });
  }

  try {
    // 1. Find valid, unused, unexpired reset row
    const [rows] = await pool.query(
      "SELECT * FROM password_resets WHERE user_id = ? AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    if (rows.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired reset link" });
    }
    const resetRow = rows[0];

    // 2. Check token hash
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    if (tokenHash !== resetRow.token_hash) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired reset link" });
    }

    // 3. Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // 4. Update user's password in auth table
    await pool.query("UPDATE auth SET password_hash = ? WHERE user_id = ?", [
      passwordHash,
      userId,
    ]);

    // 5. Mark reset row as used
    await pool.query("UPDATE password_resets SET used = TRUE WHERE id = ?", [
      resetRow.id,
    ]);

    return res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

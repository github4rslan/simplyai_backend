// backend/routes/auth-forgot-password.js
import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { sendResetPasswordEmail } from "../services/emailService.js";

const router = express.Router();

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email)
    return res.status(400).json({ success: false, message: "Email required" });

  try {
    // 1. Lookup user by email (join profiles and auth)
    const [users] = await pool.query(
      `SELECT p.id AS user_id, p.email FROM profiles p JOIN auth a ON p.id = a.user_id WHERE p.email = ?`,
      [email]
    );
    if (users.length === 0) {
      // Always return OK to avoid leaking user existence
      return res.json({
        success: true,
        message: "If the email exists, a reset link will be sent.",
      });
    }
    const user = users[0];

    // 2. Generate token and hash
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

    // 3. Insert into password_resets
    await pool.query(
      "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
      [user.user_id, tokenHash, expiresAt]
    );

    // 4. Email the user
    const resetUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/reset-password?token=${token}&uid=${user.user_id}`;
    await sendResetPasswordEmail(user.email, resetUrl);

    return res.json({
      success: true,
      message: "If the email exists, a reset link will be sent.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;

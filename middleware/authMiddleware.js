import AuthService from "../services/authService.js";
import { pool } from "../db.js";

/**
 * Middleware to authenticate JWT token
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  try {
    const user = AuthService.verifyToken(token);
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

/**
 * Middleware to require admin role
 */
export const requireAdmin = async (req, res, next) => {
  try {
    // First authenticate the token
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
      });
    }

    // Verify JWT token
    const decoded = AuthService.verifyToken(token);

    // Check user role in database (always verify from database, not just token)
    const [users] = await pool.execute(
      "SELECT role FROM profiles WHERE id = ?",
      [decoded.userId]
    );

    if (users.length === 0 || users[0].role !== "administrator") {
      return res.status(403).json({
        success: false,
        message: "Administrator access required",
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

/**
 * Middleware to validate request body
 */
export const validateRegistration = (req, res, next) => {
  const { email, password, firstName, lastName } = req.body;

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({
      success: false,
      message: "Email, password, first name, and last name are required",
    });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid email address",
    });
  }

  // Password validation
  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters long",
    });
  }

  next();
};

/**
 * Middleware to validate login request
 */
export const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  next();
};

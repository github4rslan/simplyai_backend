import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";

// JWT Secret
const JWT_SECRET =
  process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";

class AuthService {
  /**
   * Hash a password using bcrypt
   * @param {string} password - Plain text password
   * @returns {Promise<string>} - Hashed password
   */
  static async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Compare a plain text password with a hashed password
   * @param {string} password - Plain text password
   * @param {string} hashedPassword - Hashed password
   * @returns {Promise<boolean>} - True if passwords match
   */
  static async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  /**
   * Generate a JWT token
   * @param {Object} payload - Token payload
   * @param {string} expiresIn - Token expiration time
   * @returns {string} - JWT token
   */
  static generateToken(payload, expiresIn = "24h") {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
  }

  /**
   * Verify a JWT token
   * @param {string} token - JWT token
   * @returns {Object} - Decoded token payload
   */
  static verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
  }

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} - Registration result
   */
  static async registerUser(userData) {
    const { email, password, firstName, lastName, phone, address, fiscalCode } =
      userData;

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      throw new Error(
        "Email, password, first name, and last name are required"
      );
    }

    // Check if user already exists
    const [existingUsers] = await pool.execute(
      "SELECT id FROM profiles WHERE email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      throw new Error("User with this email already exists");
    }

    // Hash password
    const hashedPassword = await this.hashPassword(password);

    // Generate user ID
    const userId = uuidv4();

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Insert into auth table
      await connection.execute(
        "INSERT INTO auth (user_id, password_hash, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
        [userId, hashedPassword]
      );

      // Insert into profiles table
      await connection.execute(
        `INSERT INTO profiles (id, email, first_name, last_name, address, fiscal_code, phone, 
         full_name, created_at, updated_at, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)`,
        [
          userId,
          email,
          firstName,
          lastName,
          address || null,
          fiscalCode || null,
          phone || null,
          `${firstName} ${lastName}`,
          "user",
        ]
      );

      await connection.commit();
      connection.release();

      // Generate token
      const token = this.generateToken({ userId, email, role: "user" });

      return {
        success: true,
        message: "User registered successfully",
        data: {
          user: {
            id: userId,
            email,
            firstName,
            lastName,
            phone,
            address,
            fiscalCode,
            role: "user",
          },
          token,
        },
      };
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  }

  /**
   * Login a user
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} - Login result
   */
  static async loginUser(email, password) {
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    // Get user from database
    const [users] = await pool.execute(
      `SELECT p.id, p.email, p.first_name, p.last_name, p.phone, p.address, 
              p.fiscal_code, p.role, 
              a.password_hash 
       FROM profiles p 
       JOIN auth a ON p.id = a.user_id 
       WHERE p.email = ?`,
      [email]
    );

    if (users.length === 0) {
      throw new Error("Invalid email or password");
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await this.comparePassword(
      password,
      user.password_hash
    );

    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    // Update last activity
    await pool.execute(
      "UPDATE profiles SET last_activity = NOW() WHERE id = ?",
      [user.id]
    );

    // Generate token
    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          address: user.address,
          fiscalCode: user.fiscal_code,
          role: user.role,
          subscriptionPlan: user.subscription_plan,
          subscriptionExpiry: user.subscription_expiry,
        },
        token,
      },
    };
  }

  /**
   * Get all users (admin only)
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} - Users list
   */
  static async getAllUsers(page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    // Get total count
    const [countResult] = await pool.execute(
      "SELECT COUNT(*) as total FROM profiles"
    );
    const total = countResult[0].total;

    // Get users with pagination
    const [users] = await pool.execute(
      `SELECT id, email, first_name, last_name, phone, address, fiscal_code, 
              role, subscription_plan, subscription_expiry, created_at, 
              updated_at, last_activity
       FROM profiles 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return {
      success: true,
      data: {
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          address: user.address,
          fiscalCode: user.fiscal_code,
          role: user.role,
          subscriptionPlan: user.subscription_plan,
          subscriptionExpiry: user.subscription_expiry,
          lastActivity: user.last_activity,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - User data
   */
  static async getUserById(userId) {
    const [users] = await pool.execute(
      `SELECT p.id, p.email, p.first_name, p.last_name, p.phone, p.address, 
            p.fiscal_code, p.role, p.subscription_plan, p.subscription_expiry, 
            p.created_at, p.updated_at, p.last_activity, p.auth_provider,
            p.google_id, p.facebook_id,
            us.plan_id, us.status as subscription_status, us.started_at,
            sp.name as plan_name, sp.price as plan_price, sp.is_free as plan_is_free
     FROM profiles p
     LEFT JOIN user_subscriptions us ON p.id = us.user_id AND us.status = 'active'
     LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
     WHERE p.id = ?`,
      [userId]
    );

    if (users.length === 0) {
      throw new Error("User not found");
    }

    const user = users[0];

    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      address: user.address,
      fiscalCode: user.fiscal_code,
      role: user.role,
      authProvider: user.auth_provider || "email",
      googleId: user.google_id,
      facebookId: user.facebook_id,
      subscriptionPlan: user.subscription_plan,
      subscriptionExpiry: user.subscription_expiry,
      lastActivity: user.last_activity,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      // Include active subscription details
      subscription: user.plan_id
        ? {
            planId: user.plan_id,
            planName: user.plan_name,
            planPrice: user.plan_price,
            isFree: user.plan_is_free,
            status: user.subscription_status,
            startedAt: user.started_at,
          }
        : null,
    };
  }

  /**
   * Update user profile (firstName and lastName only - matching frontend)
   * @param {string} userId - User ID
   * @param {Object} profileData - Profile data to update
   * @param {string} profileData.firstName - First name
   * @param {string} profileData.lastName - Last name
   * @returns {Promise<Object>} - Updated user data
   */
  static async updateUserProfile(userId, profileData) {
    try {
      const { firstName, lastName } = profileData;

      // Validate required fields
      if (!firstName || !lastName) {
        throw new Error("firstName and lastName are required");
      }

      // Validate length
      if (firstName.length < 2 || lastName.length < 2) {
        throw new Error("Nome e cognome devono contenere almeno 2 caratteri");
      }

      // Execute update query
      const [result] = await pool.execute(
        `UPDATE profiles 
         SET first_name = ?, last_name = ?, updated_at = NOW()
         WHERE id = ?`,
        [firstName, lastName, userId]
      );

      if (result.affectedRows === 0) {
        throw new Error("User not found");
      }

      // Fetch and return updated user data
      const updatedUser = await this.getUserById(userId);

      return {
        success: true,
        message: "Profile updated successfully",
        data: updatedUser.data,
      };
    } catch (error) {
      console.error("Update user profile error:", error);
      throw error;
    }
  }

  /**
   * Update user password (without current password verification - matching frontend)
   * @param {string} userId - User ID
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} - Success message
   */
  /**
   * Update user password (without current password verification - matching frontend)
   * @param {string} userId - User ID (from profiles table)
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} - Success message
   */
  static async updatePassword(userId, newPassword) {
    try {
      // Validate password length
      if (!newPassword || newPassword.length < 6) {
        throw new Error("Password must be at least 6 characters long");
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password in auth table using user_id
      const [result] = await pool.execute(
        "UPDATE auth SET password_hash = ?, updated_at = NOW() WHERE user_id = ?",
        [hashedPassword, userId]
      );

      if (result.affectedRows === 0) {
        throw new Error("User not found");
      }

      return {
        success: true,
        message: "Password updated successfully",
      };
    } catch (error) {
      console.error("Update password error:", error);
      throw error;
    }
  }
}

export default AuthService;

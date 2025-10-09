import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";
import { sendPaymentNotificationEmail } from "../services/emailService.js";

// Helper function to get default free plan ID
async function getDefaultFreePlanId() {
  try {
    // Use 'subscription_plans' table since 'plans' table doesn't exist
    const [plans] = await pool.execute(
      "SELECT id FROM subscription_plans WHERE is_free = true OR price = 0 ORDER BY created_at ASC LIMIT 1"
    );

    if (plans.length > 0) {
      return plans[0].id;
    }

    const [anyPlans] = await pool.execute(
      "SELECT id FROM subscription_plans ORDER BY price ASC, created_at ASC LIMIT 1"
    );

    if (anyPlans.length > 0) {
      return anyPlans[0].id;
    }

    throw new Error("No subscription plans found in database");
  } catch (error) {
    console.error(
      "Error getting default free plan from subscription_plans table:",
      error
    );
    throw new Error(
      "Unable to find subscription_plans table or get default plan"
    );
  }
}

const router = express.Router();

// JWT Secret - In production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET;

// Register-with-plan endpoint for frontend compatibility (free plan registration)
router.post("/register-with-plan", async (req, res) => {
  try {
    // Accepts: { email, password, firstName, lastName, phone, planId }
    const { email, password, firstName, lastName, phone, planId } = req.body;

    if (!email || !password || !firstName || !lastName || !planId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields for registration-with-plan",
      });
    }

    // Check if user already exists
    const [existingUsers] = await pool.execute(
      "SELECT id FROM profiles WHERE email = ?",
      [email]
    );
    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Validate planId and get plan details
    let planResult;
    let finalPlanId = planId;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(planId)) {
      // It's a plan name, so we need to find the corresponding plan ID
      [planResult] = await pool.execute(
        "SELECT id, name, is_free, price FROM subscription_plans WHERE name = ? OR id = ?",
        [planId, planId]
      );
      if (planResult.length > 0) {
        finalPlanId = planResult[0].id;
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid plan selected",
        });
      }
    } else {
      [planResult] = await pool.execute(
        "SELECT id, name, is_free, price FROM subscription_plans WHERE id = ?",
        [planId]
      );
      if (planResult.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid plan selected",
        });
      }
    }
    const plan = planResult[0];
    if (!plan.is_free && plan.price > 0) {
      return res.status(400).json({
        success: false,
        message: "Only free plans are allowed for this endpoint.",
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
      await connection.execute(
        "INSERT INTO auth (user_id, password_hash, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
        [userId, hashedPassword]
      );
      await connection.execute(
        "INSERT INTO profiles (id, email, first_name, last_name, phone, full_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
        [
          userId,
          email,
          firstName,
          lastName,
          phone || null,
          `${firstName} ${lastName}`,
        ]
      );
      await connection.execute(
        "INSERT INTO user_subscriptions (id, user_id, plan_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())",
        [uuidv4(), userId, finalPlanId, "active"]
      );
      await connection.commit();
      connection.release();

      // Generate JWT token
      const token = jwt.sign({ userId, email }, JWT_SECRET, {
        expiresIn: "24h",
      });

      // Send welcome email
      try {
        await sendPaymentNotificationEmail({
          email,
          firstName,
          lastName,
          planName: plan.name,
          planPrice: 0,
          isFreeRegistration: true,
        });
      } catch (emailError) {
        // Don't fail registration if email fails
      }

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        user: {
          id: userId,
          email,
          firstName,
          lastName,
          phone,
          planId: finalPlanId,
          planName: plan.name,
          isFree: true,
        },
        token,
      });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to register user with plan",
      error: error.message,
    });
  }
});

// Register endpoint - For paid plans, only validate and store temporarily
router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, subscription_plan } =
      req.body;

    console.log("Registration attempt:", {
      email,
      firstName,
      lastName,
      phone,
      subscription_plan,
    });

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "Email, password, first name, and last name are required",
      });
    }

    // Check if user already exists (email is in profiles table)
    const [existingUsers] = await pool.execute(
      "SELECT id FROM profiles WHERE email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate user ID
    const userId = uuidv4();

    // Check if plan is free or paid
    let isFreeRegistration = true; // Default to free if no plan specified
    let planExists = false;
    let finalPlanId = subscription_plan;

    if (subscription_plan) {
      // First check if it's already a valid plan ID (UUID format)
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!uuidRegex.test(subscription_plan)) {
        // It's a plan name, so we need to find the corresponding plan ID
        try {
          // Use 'subscription_plans' table since 'plans' table doesn't exist
          const [planResult] = await pool.execute(
            "SELECT id, is_free, price FROM subscription_plans WHERE name = ? OR id = ?",
            [subscription_plan, subscription_plan]
          );

          if (planResult.length > 0) {
            planExists = true;
            const plan = planResult[0];
            finalPlanId = plan.id;
            isFreeRegistration = plan.is_free || plan.price === 0;
            console.log(
              "✅ Found registration plan by name:",
              subscription_plan,
              "-> ID:",
              finalPlanId
            );
          } else {
            console.warn("⚠️ Registration plan not found:", subscription_plan);
            return res.status(400).json({
              success: false,
              message: "Invalid subscription plan selected",
            });
          }
        } catch (error) {
          console.error("❌ Error finding registration plan by name:", error);
          return res.status(400).json({
            success: false,
            message: "Invalid subscription plan selected",
          });
        }
      } else {
        // It's already a plan ID, validate it exists
        try {
          const [planResult] = await pool.execute(
            "SELECT is_free, price FROM subscription_plans WHERE id = ?",
            [subscription_plan]
          );

          if (planResult.length > 0) {
            planExists = true;
            const plan = planResult[0];
            isFreeRegistration = plan.is_free || plan.price === 0;
            console.log(
              "✅ Registration plan ID format detected:",
              subscription_plan
            );
          } else {
            return res.status(400).json({
              success: false,
              message: "Invalid subscription plan selected",
            });
          }
        } catch (error) {
          console.error("❌ Error validating registration plan ID:", error);
          return res.status(400).json({
            success: false,
            message: "Invalid subscription plan selected",
          });
        }
      }
    }

    if (isFreeRegistration) {
      // For FREE plans - Create user immediately (existing flow)
      console.log("🆓 Creating free plan user:", {
        userId,
        email,
        subscription_plan,
      });

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        // Insert into auth table FIRST (most critical for login)
        console.log("📝 Creating auth record for user:", userId);
        await connection.execute(
          "INSERT INTO auth (user_id, password_hash, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
          [userId, hashedPassword]
        );
        console.log("✅ Auth record created successfully");

        // Insert into profiles table
        console.log("👤 Creating profile record for user:", userId);
        await connection.execute(
          "INSERT INTO profiles (id, email, first_name, last_name, phone, full_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
          [
            userId,
            email,
            firstName,
            lastName,
            phone || null,
            `${firstName} ${lastName}`,
          ]
        );
        console.log("✅ Profile record created successfully");

        // Create active subscription for free plan
        const subscriptionPlanId =
          finalPlanId || (await getDefaultFreePlanId());
        console.log(
          "📋 Creating subscription record for plan ID:",
          subscriptionPlanId
        );
        await connection.execute(
          "INSERT INTO user_subscriptions (id, user_id, plan_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())",
          [uuidv4(), userId, subscriptionPlanId, "active"]
        );
        console.log("✅ Subscription record created successfully");

        await connection.commit();
        console.log("✅ Transaction committed successfully");
        connection.release();

        // Generate JWT token
        const token = jwt.sign({ userId, email }, JWT_SECRET, {
          expiresIn: "24h",
        });

        console.log("✅ Free plan user registered successfully:", userId);

        // Check if welcome emails are enabled in settings before sending
        let shouldSendWelcomeEmail = true; // Default to true
        try {
          const [settingsResult] = await pool.query(
            "SELECT send_welcome_email FROM app_settings ORDER BY created_at DESC LIMIT 1"
          );
          if (settingsResult.length > 0) {
            shouldSendWelcomeEmail = Boolean(
              settingsResult[0].send_welcome_email
            );
          }
          console.log(
            "📧 Welcome email setting checked:",
            shouldSendWelcomeEmail
          );
        } catch (settingsError) {
          console.error(
            "❌ Error checking email settings:",
            settingsError.message
          );
          // Continue with default (true) if settings check fails
        }

        // Send welcome email notification for free plan
        if (shouldSendWelcomeEmail) {
          try {
            await sendPaymentNotificationEmail({
              email,
              firstName,
              lastName,
              planName: "Piano Gratuito",
              planPrice: 0,
              isFreeRegistration: true,
            });
            console.log("✅ Welcome email sent to free plan user:", email);
          } catch (emailError) {
            console.error(
              "Failed to send welcome email to free plan user:",
              emailError
            );
            // Don't fail the registration if email fails
          }
        } else {
          console.log(
            "📧 Welcome email disabled in settings - skipping email for:",
            email
          );
        }

        res.status(201).json({
          success: true,
          message: "User registered successfully",
          data: {
            user: {
              id: userId,
              email,
              firstName,
              lastName,
              phone,
            },
            token,
          },
        });
      } catch (error) {
        console.error(
          "❌ Transaction failed during free user registration:",
          error
        );
        console.error("❌ Rolling back transaction for user:", userId);
        await connection.rollback();
        connection.release();
        throw error;
      }
    } else {
      // For PAID plans - Store temporarily until payment completion
      const tempUserData = {
        userId,
        email,
        firstName,
        lastName,
        phone: phone || null,
        hashedPassword,
        subscription_plan,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes expiration
      };

      // Store in temporary table (create if doesn't exist)
      try {
        // First, create the temporary table if it doesn't exist
        await pool.execute(`
          CREATE TABLE IF NOT EXISTS temp_registrations (
            id VARCHAR(36) PRIMARY KEY,
            email VARCHAR(255) UNIQUE,
            first_name VARCHAR(255),
            last_name VARCHAR(255),
            phone VARCHAR(20),
            password_hash TEXT,
            subscription_plan VARCHAR(36),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP
          )
        `);

        // Store temporary registration data
        await pool.execute(
          "INSERT INTO temp_registrations (id, email, first_name, last_name, phone, password_hash, subscription_plan, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            userId,
            email,
            firstName,
            lastName,
            phone || null,
            hashedPassword,
            subscription_plan || null,
            tempUserData.createdAt,
            tempUserData.expiresAt,
          ]
        );

        console.log(
          "💳 Paid plan user stored temporarily for payment:",
          userId
        );

        // Return user ID for payment processing (no auth token yet)
        res.status(201).json({
          success: true,
          message:
            "Registration data validated. Please complete payment to finalize account.",
          data: {
            tempUserId: userId,
            email,
            firstName,
            lastName,
            phone,
            requiresPayment: true,
          },
        });
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
          return res.status(400).json({
            success: false,
            message: "Registration already in progress for this email",
          });
        }
        throw error;
      }
    }
  } catch (error) {
    console.error("Registration error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to register user",
      error: error.message,
      details: error.code || "Unknown error",
    });
  }
});

// Login endpoint
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("Login attempt:", { email });

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Get user from database (email is in profiles, password_hash is in auth)
    const [users] = await pool.execute(
      `SELECT p.id, p.email, p.first_name, p.last_name, p.phone, p.role, a.password_hash 
       FROM profiles p 
       JOIN auth a ON p.id COLLATE utf8mb4_general_ci = a.user_id 
       WHERE p.email = ?`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Update last_activity in profiles table
    await pool.execute(
      "UPDATE profiles SET last_activity = NOW() WHERE id = ?",
      [user.id]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    console.log("User logged in successfully:", user.id);

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role,
          isAdmin: user.role === "administrator",
        },
        token,
      },
    });
  } catch (error) {
    console.error("Login error:", error); // <-- This logs to server
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
      stack: error.stack,
    });
  }
});

// Get current user endpoint
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [users] = await pool.execute(
      `SELECT p.id, p.email, p.first_name, p.last_name, p.phone, p.role,
              s.plan_id, s.status as subscription_status
       FROM profiles p 
       LEFT JOIN user_subscriptions s ON p.id COLLATE utf8mb4_general_ci = s.user_id
       WHERE p.id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role,
          subscriptionPlan: user.plan_id,
          subscriptionStatus: user.subscription_status,
          isAdmin: user.role === "administrator",
        },
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user data",
      error: error.message,
    });
  }
});

// Logout endpoint
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to logout",
    });
  }
});

// Middleware to authenticate token
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: "Invalid or expired token",
      });
    }
    req.user = user;
    next();
  });
}

// Admin middleware - requires administrator role
const requireAdmin = async (req, res, next) => {
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
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check user role in database (always verify from database, not just token)
    const [users] = await pool.execute(
      `SELECT p.role FROM profiles p WHERE p.id = ?`,
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

// Google registration completion endpoint
router.post("/register/google", async (req, res) => {
  try {
    console.log("🔍 INCOMING GOOGLE REGISTRATION REQUEST:");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    console.log("Raw body type:", typeof req.body);

    const { googleData, subscription_plan } = req.body;

    console.log("Google registration completion:", {
      googleData,
      subscription_plan,
    });

    // Validate required Google data
    if (
      !googleData ||
      !googleData.email ||
      !googleData.firstName ||
      !googleData.lastName ||
      !googleData.googleId
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid Google profile data",
      });
    }

    const { email, firstName, lastName, googleId } = googleData;

    // Check if user already exists (to prevent duplicate registration)
    const [existingUsers] = await pool.execute(
      "SELECT id FROM profiles WHERE email = ? OR google_id = ?",
      [email, googleId]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: "User with this email or Google account already exists",
      });
    }

    // Generate user ID
    const userId = uuidv4();

    // Get plan ID (either provided or default free plan)
    let finalPlanId = subscription_plan;

    // If subscription_plan is provided, check if it's a plan ID or plan name
    if (subscription_plan) {
      // First check if it's already a valid plan ID (UUID format)
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!uuidRegex.test(subscription_plan)) {
        // It's a plan name, so we need to find the corresponding plan ID
        try {
          // Use 'subscription_plans' table since 'plans' table doesn't exist
          const [planResult] = await pool.execute(
            "SELECT id FROM subscription_plans WHERE name = ? OR id = ?",
            [subscription_plan, subscription_plan]
          );

          if (planResult.length > 0) {
            finalPlanId = planResult[0].id;
            console.log(
              "✅ Found plan by name:",
              subscription_plan,
              "-> ID:",
              finalPlanId
            );
          } else {
            console.warn(
              "⚠️ Plan not found, using default free plan:",
              subscription_plan
            );
            finalPlanId = await getDefaultFreePlanId();
          }
        } catch (error) {
          console.error(
            "❌ Error finding plan by name, using default free plan:",
            error
          );
          finalPlanId = await getDefaultFreePlanId();
        }
      } else {
        console.log("✅ Plan ID format detected:", subscription_plan);
      }
    } else {
      // No plan specified, use default free plan
      finalPlanId = await getDefaultFreePlanId();
    }

    console.log("🎯 Final plan ID to be used:", finalPlanId);

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Create auth record (no password for OAuth users)
      await connection.execute(
        "INSERT INTO auth (user_id, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [userId]
      );

      // Create profile record
      await connection.execute(
        `INSERT INTO profiles (id, email, first_name, last_name, full_name, google_id, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          userId,
          email,
          firstName,
          lastName,
          `${firstName} ${lastName}`,
          googleId,
        ]
      );

      // Always create subscription record
      await connection.execute(
        "INSERT INTO user_subscriptions (id, user_id, plan_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())",
        [uuidv4(), userId, finalPlanId, "active"]
      );

      await connection.commit();
      connection.release();

      // Generate JWT token for the new user
      const token = jwt.sign(
        {
          userId: userId,
          email: email,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      console.log("Google user registered successfully:", userId);

      // Send welcome email notification
      try {
        const planName =
          subscription_plan === "free" ? "Piano Gratuito" : subscription_plan;
        const isFreeRegistration =
          !subscription_plan ||
          subscription_plan === "free" ||
          subscription_plan === "Piano Gratuito";

        if (isFreeRegistration) {
          await sendPaymentNotificationEmail({
            email,
            firstName,
            lastName,
            planName: planName,
            planPrice: 0,
            isFreeRegistration: true,
          });
          console.log(
            "✅ Welcome email sent to Google user (free plan):",
            email
          );
        } else {
          // If it's a paid plan, include payment info - get actual plan price
          const transactionId = `OAUTH_${Date.now()}_${uuidv4().substring(
            0,
            8
          )}`;

          // Get actual plan price from database
          let actualPlanPrice = 0;
          try {
            const [planDetails] = await pool.query(
              "SELECT price FROM subscription_plans WHERE name = ? OR id = ?",
              [planName, planName]
            );
            if (planDetails.length > 0) {
              actualPlanPrice = planDetails[0].price;
            }
          } catch (error) {
            console.error(
              "Error fetching plan price for OAuth registration:",
              error
            );
          }

          await sendPaymentNotificationEmail({
            email,
            firstName,
            lastName,
            planName: planName,
            planPrice: actualPlanPrice,
            paymentMethod: "OAuth Registration",
            transactionId: transactionId,
            isFreeRegistration: false,
          });
          console.log(
            "✅ Welcome email sent to Google user (paid plan):",
            email,
            "Price:",
            actualPlanPrice
          );
        }
      } catch (emailError) {
        console.error(
          "Failed to send welcome email to Google user:",
          emailError
        );
        // Don't fail the registration if email fails
      }

      res.status(201).json({
        success: true,
        message: "Google user registered successfully",
        data: {
          user: {
            id: userId,
            email,
            firstName,
            lastName,
            subscriptionPlan: finalPlanId,
          },
          token,
        },
      });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error("Google registration error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to register Google user",
      error: error.message,
      details: error.code || "Unknown error",
    });
  }
});

// Facebook registration completion endpoint
router.post("/register/facebook", async (req, res) => {
  try {
    const { facebookData, subscription_plan } = req.body;

    console.log("Facebook registration completion:", {
      facebookData,
      subscription_plan,
    });

    // Validate required Facebook data
    if (
      !facebookData ||
      !facebookData.email ||
      !facebookData.firstName ||
      !facebookData.lastName ||
      !facebookData.facebookId
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid Facebook profile data",
      });
    }

    const { email, firstName, lastName, facebookId } = facebookData;

    // Check if user already exists (to prevent duplicate registration)
    const [existingUsers] = await pool.execute(
      "SELECT id FROM profiles WHERE email = ? OR facebook_id = ?",
      [email, facebookId]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: "User with this email or Facebook account already exists",
      });
    }

    // Generate user ID
    const userId = uuidv4();

    // Get plan ID (either provided or default free plan)
    let finalPlanId = subscription_plan;

    // If subscription_plan is provided, check if it's a plan ID or plan name
    if (subscription_plan) {
      // First check if it's already a valid plan ID (UUID format)
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!uuidRegex.test(subscription_plan)) {
        // It's a plan name, so we need to find the corresponding plan ID
        try {
          // Use 'subscription_plans' table since 'plans' table doesn't exist
          const [planResult] = await pool.execute(
            "SELECT id FROM subscription_plans WHERE name = ? OR id = ?",
            [subscription_plan, subscription_plan]
          );

          if (planResult.length > 0) {
            finalPlanId = planResult[0].id;
            console.log(
              "✅ Found Facebook plan by name:",
              subscription_plan,
              "-> ID:",
              finalPlanId
            );
          } else {
            console.warn(
              "⚠️ Facebook plan not found, using default free plan:",
              subscription_plan
            );
            finalPlanId = await getDefaultFreePlanId();
          }
        } catch (error) {
          console.error(
            "❌ Error finding Facebook plan by name, using default free plan:",
            error
          );
          finalPlanId = await getDefaultFreePlanId();
        }
      } else {
        console.log("✅ Facebook plan ID format detected:", subscription_plan);
      }
    } else {
      // No plan specified, use default free plan
      finalPlanId = await getDefaultFreePlanId();
    }

    console.log("🎯 Final Facebook plan ID to be used:", finalPlanId);

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Create auth record (no password for OAuth users)
      await connection.execute(
        "INSERT INTO auth (user_id, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [userId]
      );

      // Create profile record
      await connection.execute(
        `INSERT INTO profiles (id, email, first_name, last_name, full_name, facebook_id, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          userId,
          email,
          firstName,
          lastName,
          `${firstName} ${lastName}`,
          facebookId,
        ]
      );

      // Always create subscription record
      await connection.execute(
        "INSERT INTO user_subscriptions (id, user_id, plan_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())",
        [uuidv4(), userId, finalPlanId, "active"]
      );

      await connection.commit();
      connection.release();

      // Generate JWT token for the new user
      const token = jwt.sign(
        {
          userId: userId,
          email: email,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      console.log("Facebook user registered successfully:", userId);

      // Send welcome email notification
      try {
        const planName =
          subscription_plan === "free" ? "Piano Gratuito" : subscription_plan;
        const isFreeRegistration =
          !subscription_plan ||
          subscription_plan === "free" ||
          subscription_plan === "Piano Gratuito";

        if (isFreeRegistration) {
          await sendPaymentNotificationEmail({
            email,
            firstName,
            lastName,
            planName: planName,
            planPrice: 0,
            isFreeRegistration: true,
          });
          console.log(
            "✅ Welcome email sent to Facebook user (free plan):",
            email
          );
        } else {
          // If it's a paid plan, include payment info - get actual plan price
          const transactionId = `OAUTH_${Date.now()}_${uuidv4().substring(
            0,
            8
          )}`;

          // Get actual plan price from database
          let actualPlanPrice = 0;
          try {
            const [planDetails] = await pool.query(
              "SELECT price FROM subscription_plans WHERE name = ? OR id = ?",
              [planName, planName]
            );
            if (planDetails.length > 0) {
              actualPlanPrice = planDetails[0].price;
            }
          } catch (error) {
            console.error(
              "Error fetching plan price for Facebook OAuth registration:",
              error
            );
          }

          await sendPaymentNotificationEmail({
            email,
            firstName,
            lastName,
            planName: planName,
            planPrice: actualPlanPrice,
            paymentMethod: "OAuth Registration",
            transactionId: transactionId,
            isFreeRegistration: false,
          });
          console.log(
            "✅ Welcome email sent to Facebook user (paid plan):",
            email,
            "Price:",
            actualPlanPrice
          );
        }
      } catch (emailError) {
        console.error(
          "Failed to send welcome email to Facebook user:",
          emailError
        );
        // Don't fail the registration if email fails
      }

      res.status(201).json({
        success: true,
        message: "Facebook user registered successfully",
        data: {
          user: {
            id: userId,
            email,
            firstName,
            lastName,
            subscriptionPlan: finalPlanId,
          },
          token,
        },
      });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error("Facebook registration error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to register Facebook user",
      error: error.message,
      details: error.code || "Unknown error",
    });
  }
});

// Create user account from temporary data with plan selection
router.post("/register/complete-with-plan", async (req, res) => {
  try {
    const { tempUserData, planId } = req.body;

    console.log("Completing registration with plan:", {
      email: tempUserData?.email,
      planId,
    });

    // Validate required fields
    if (
      !tempUserData ||
      !tempUserData.email ||
      !tempUserData.password ||
      !tempUserData.firstName ||
      !tempUserData.lastName
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required user data",
      });
    }

    if (!planId) {
      return res.status(400).json({
        success: false,
        message: "Plan selection is required",
      });
    }

    const { email, password, firstName, lastName, phone } = tempUserData;

    // Check if user already exists
    const [existingUsers] = await pool.execute(
      "SELECT id FROM profiles WHERE email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Check if plan exists and get plan details
    let planResult;
    let finalPlanId = planId;

    // First check if it's already a valid plan ID (UUID format)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(planId)) {
      // It's a plan name, so we need to find the corresponding plan ID
      try {
        [planResult] = await pool.execute(
          "SELECT id, name, is_free, price FROM subscription_plans WHERE name = ? OR id = ?",
          [planId, planId]
        );

        if (planResult.length > 0) {
          finalPlanId = planResult[0].id;
          console.log(
            "✅ Found complete-with-plan by name:",
            planId,
            "-> ID:",
            finalPlanId
          );
        }
      } catch (error) {
        console.error("❌ Error finding complete-with-plan by name:", error);
      }
    } else {
      // It's already a plan ID, just validate it
      try {
        [planResult] = await pool.execute(
          "SELECT id, name, is_free, price FROM subscription_plans WHERE id = ?",
          [planId]
        );
      } catch (error) {
        console.error("❌ Error validating complete-with-plan ID:", error);
      }
    }

    if (planResult.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription plan selected",
      });
    }

    const plan = planResult[0];
    const isFreeRegistration = plan.is_free || plan.price === 0;

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

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
        "INSERT INTO profiles (id, email, first_name, last_name, phone, full_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
        [
          userId,
          email,
          firstName,
          lastName,
          phone || null,
          `${firstName} ${lastName}`,
        ]
      );

      // Create subscription
      await connection.execute(
        "INSERT INTO user_subscriptions (id, user_id, plan_id, status, started_at, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())",
        [uuidv4(), userId, finalPlanId, "active"]
      );

      await connection.commit();
      connection.release();

      // Generate JWT token
      const token = jwt.sign({ userId, email }, JWT_SECRET, {
        expiresIn: "24h",
      });

      console.log(
        "✅ User registered successfully with plan:",
        userId,
        plan.name
      );

      // Send email notification with payment information for paid plans
      try {
        if (isFreeRegistration) {
          // Free plan - no payment info needed
          await sendPaymentNotificationEmail({
            email,
            firstName,
            lastName,
            planName: plan.name,
            planPrice: 0,
            isFreeRegistration: true,
          });
          console.log(
            "✅ Free plan registration confirmation email sent:",
            email,
            plan.name
          );
        } else {
          // Paid plan - include payment information
          const transactionId = `REG_${Date.now()}_${uuidv4().substring(0, 8)}`;

          // For new registration flow, we assume payment was processed externally
          // Include payment details in the email
          await sendPaymentNotificationEmail({
            email,
            firstName,
            lastName,
            planName: plan.name,
            planPrice: plan.price,
            paymentMethod: "Carta di Credito", // Default payment method for registrations
            transactionId: transactionId,
            isFreeRegistration: false,
          });
          console.log(
            "✅ Paid plan registration confirmation email sent with payment info:",
            email,
            plan.name
          );
        }
      } catch (emailError) {
        console.error(
          "Failed to send registration confirmation email:",
          emailError
        );
        // Don't fail the registration if email fails
      }

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          user: {
            id: userId,
            email,
            firstName,
            lastName,
            phone,
            planId,
            planName: plan.name,
            isFree: isFreeRegistration,
          },
          token,
        },
      });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error("Complete registration error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to complete registration",
      error: error.message,
      details: error.code || "Unknown error",
    });
  }
});

// Cleanup expired temporary registrations
router.delete("/cleanup-expired-registrations", async (req, res) => {
  try {
    const [result] = await pool.execute(
      "DELETE FROM temp_registrations WHERE expires_at < NOW()"
    );

    console.log(
      `🧹 Cleaned up ${result.affectedRows} expired temporary registrations`
    );

    res.json({
      success: true,
      message: `Cleaned up ${result.affectedRows} expired registrations`,
      data: {
        deletedCount: result.affectedRows,
      },
    });
  } catch (error) {
    console.error("❌ Error cleaning up expired registrations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup expired registrations",
      error: error.message,
    });
  }
});

export default router;
export { authenticateToken };

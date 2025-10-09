import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";
import passport from "../config/passport.js";

import { sendPaymentNotificationEmail } from "../services/emailService.js";
import AuthService from "../services/authService.js";
import {
  authenticateToken,
  requireAdmin,
  validateRegistration,
  validateLogin,
} from "../middleware/authMiddleware.js";

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";
const FRONTEND_URL = process.env.FRONTEND_URL;

const router = express.Router();

// Check if email exists endpoint
router.post("/check-email", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Check in profiles table (main user data) - this is where emails are stored
    const [profileRows] = await pool.query(
      "SELECT id FROM profiles WHERE email = ?",
      [email]
    );

    const emailExists = profileRows.length > 0;

    console.log(
      `📧 Email check for "${email}": ${emailExists ? "EXISTS" : "AVAILABLE"}`
    );

    res.json({
      success: true,
      exists: emailExists,
      message: emailExists ? "Email already registered" : "Email available",
    });
  } catch (error) {
    console.error("Check email error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check email availability",
    });
  }
});

// Register endpoint
router.post("/register", validateRegistration, async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, address, fiscalCode } =
      req.body;

    console.log("Registration attempt:", { email, firstName, lastName });

    const result = await AuthService.registerUser({
      email,
      password,
      firstName,
      lastName,
      phone,
      address,
      fiscalCode,
    });

    console.log("User registered successfully:", result.data.user.id);

    res.status(201).json(result);
  } catch (error) {
    console.error("Registration error:", error);

    res.status(400).json({
      success: false,
      message: error.message || "Failed to register user",
    });
  }
});

// Login endpoint
// Login endpoint
router.post("/login", validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("Login attempt:", { email });

    // First, get user profile to check auth provider
    const [profiles] = await pool.execute(
      `SELECT id, email, auth_provider, google_id, facebook_id, 
              first_name, last_name, role 
       FROM profiles 
       WHERE email = ?`,
      [email]
    );

    if (profiles.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Credenziali non valide",
      });
    }

    const profile = profiles[0];

    // Check if this is an OAuth account
    if (profile.auth_provider === "google" && profile.google_id) {
      // Check if they have a password (might have linked accounts)
      const [authRecords] = await pool.execute(
        "SELECT password_hash FROM auth WHERE user_id = ?",
        [profile.id]
      );

      const hasPassword =
        authRecords.length > 0 && authRecords[0].password_hash;

      if (!hasPassword) {
        return res.status(400).json({
          success: false,
          message:
            "Questo account utilizza l'accesso Google. Usa il pulsante 'Continua con Google'.",
          provider: "google",
          isOAuthAccount: true,
        });
      }
    }

    if (profile.auth_provider === "facebook" && profile.facebook_id) {
      const [authRecords] = await pool.execute(
        "SELECT password_hash FROM auth WHERE user_id = ?",
        [profile.id]
      );

      const hasPassword =
        authRecords.length > 0 && authRecords[0].password_hash;

      if (!hasPassword) {
        return res.status(400).json({
          success: false,
          message:
            "Questo account utilizza l'accesso Facebook. Usa il pulsante 'Continua con Facebook'.",
          provider: "facebook",
          isOAuthAccount: true,
        });
      }
    }

    // If we get here, proceed with regular password login
    const result = await AuthService.loginUser(email, password);

    console.log("User logged in successfully:", result.data.user.id);

    res.json(result);
  } catch (error) {
    console.error("Login error:", error);

    res.status(401).json({
      success: false,
      message: error.message || "Impossibile effettuare l'accesso",
    });
  }
});

// Get current user endpoint
// Get current user endpoint
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await AuthService.getUserById(userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(404).json({
      success: false,
      message: error.message || "Failed to get user data",
    });
  }
});

// Update user profile endpoint
router.patch("/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { firstName, lastName } = req.body;

    // Validate input
    if (!firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "firstName and lastName are required",
      });
    }

    // Validate length
    if (firstName.length < 2 || lastName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Nome e cognome devono contenere almeno 2 caratteri",
      });
    }

    const result = await AuthService.updateUserProfile(userId, {
      firstName,
      lastName,
    });

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update user profile error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update user profile",
    });
  }
});

// Change password endpoint
router.patch("/change-password", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { newPassword } = req.body;

    // Validate input
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password is required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    await AuthService.updatePassword(userId, newPassword);

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update password",
    });
  }
});

// Get all users endpoint (admin only)
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    console.log("Admin getting all users:", { page, limit });

    const result = await AuthService.getAllUsers(page, limit);

    res.json(result);
  } catch (error) {
    console.error("Get all users error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to get users",
    });
  }
});

// Logout endpoint (stateless JWT - just returns success)
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

// Complete registration with plan selection
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

      // Send email notification with payment information for paid plans
      if (shouldSendWelcomeEmail) {
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
            const transactionId = `REG_${Date.now()}_${uuidv4().substring(
              0,
              8
            )}`;

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

// Google OAuth routes
router.get("/google", (req, res, next) => {
  console.log("========================================");
  console.log("🔵 Google OAuth Request Started");
  console.log("🔵 BACKEND_URL:", process.env.BACKEND_URL);
  console.log(
    "🔵 Expected callback:",
    `${process.env.BACKEND_URL}/api/auth/google/callback`
  );
  console.log("========================================");

  passport.authenticate("google", {
    scope: ["profile", "email"],
  })(req, res, next);
});
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}/login?error=google_auth_failed`,
    session: false,
  }),
  async (req, res) => {
    try {
      const user = req.user;

      // Check if this is a new user
      if (user.isNewUser) {
        console.log("🆕 New user from Google, redirecting to pricing page");

        // Store Google profile data temporarily in session or send to frontend
        const tempData = encodeURIComponent(JSON.stringify(user.googleProfile));

        // Redirect to pricing/registration page with Google data
        return res.redirect(
          `${FRONTEND_URL}/register?provider=google&data=${tempData}`
        );
      }

      // Existing user - generate token and login
      console.log("✅ Existing user login via Google:", user.email);

      // Update last activity
      await pool.execute(
        "UPDATE profiles SET last_activity = NOW() WHERE id = ?",
        [user.id]
      );

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      // Prepare user data
      const userData = {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        role: user.role,
        isAdmin: user.role === "administrator",
      };

      // Redirect to frontend with token
      res.redirect(
        `${FRONTEND_URL}/auth/callback?token=${token}&user=${encodeURIComponent(
          JSON.stringify(userData)
        )}`
      );
    } catch (error) {
      console.error("Google callback error:", error);
      res.redirect(`${FRONTEND_URL}/login?error=token_generation_failed`);
    }
  }
);

// Facebook OAuth routes
router.get(
  "/facebook",
  passport.authenticate("facebook", {
    scope: ["email"],
  })
);

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", {
    failureRedirect: `${FRONTEND_URL}/login?error=facebook_auth_failed`,
    session: false,
  }),
  async (req, res) => {
    try {
      const user = req.user;

      // Check if this is a new user
      if (user.isNewUser) {
        console.log("🆕 New user from Facebook, redirecting to pricing page");

        const tempData = encodeURIComponent(
          JSON.stringify(user.facebookProfile)
        );

        return res.redirect(
          `${FRONTEND_URL}/register?provider=facebook&data=${tempData}`
        );
      }

      // Existing user - generate token and login
      console.log("✅ Existing user login via Facebook:", user.email);

      // Update last activity
      await pool.execute(
        "UPDATE profiles SET last_activity = NOW() WHERE id = ?",
        [user.id]
      );

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      // Prepare user data
      const userData = {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        role: user.role,
        isAdmin: user.role === "administrator",
      };

      // Redirect to frontend with token
      res.redirect(
        `${FRONTEND_URL}/auth/callback?token=${token}&user=${encodeURIComponent(
          JSON.stringify(userData)
        )}`
      );
    } catch (error) {
      console.error("Facebook callback error:", error);
      res.redirect(`${FRONTEND_URL}/login?error=token_generation_failed`);
    }
  }
);
// Google registration completion endpoint
router.post("/register/google", async (req, res) => {
  try {
    console.log("🔍 INCOMING GOOGLE REGISTRATION REQUEST:");
    console.log("Body:", req.body);

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

    if (subscription_plan) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!uuidRegex.test(subscription_plan)) {
        try {
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
      }
    } else {
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

      // Create profile record WITH auth_provider and email_verified
      await connection.execute(
        `INSERT INTO profiles 
         (id, email, first_name, last_name, full_name, google_id, 
          auth_provider, email_verified, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, 'google', TRUE, NOW(), NOW())`,
        [
          userId,
          email,
          firstName,
          lastName,
          `${firstName} ${lastName}`,
          googleId,
        ]
      );

      // Create subscription record
      await connection.execute(
        `INSERT INTO user_subscriptions 
         (id, user_id, plan_id, status, started_at, created_at, updated_at) 
         VALUES (?, ?, ?, 'active', NOW(), NOW(), NOW())`,
        [uuidv4(), userId, finalPlanId]
      );

      await connection.commit();
      connection.release();

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: userId,
          email: email,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      console.log("✅ Google user registered successfully:", userId);

      // Send welcome email
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
          const transactionId = `OAUTH_${Date.now()}_${uuidv4().substring(
            0,
            8
          )}`;
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
            console.error("Error fetching plan price:", error);
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
            email
          );
        }
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
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
    console.error("❌ Google registration error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to register Google user",
      error: error.message,
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

    // Check if user already exists
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

    const userId = uuidv4();
    let finalPlanId = subscription_plan;

    if (subscription_plan) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!uuidRegex.test(subscription_plan)) {
        try {
          const [planResult] = await pool.execute(
            "SELECT id FROM subscription_plans WHERE name = ? OR id = ?",
            [subscription_plan, subscription_plan]
          );

          if (planResult.length > 0) {
            finalPlanId = planResult[0].id;
          } else {
            finalPlanId = await getDefaultFreePlanId();
          }
        } catch (error) {
          finalPlanId = await getDefaultFreePlanId();
        }
      }
    } else {
      finalPlanId = await getDefaultFreePlanId();
    }

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Create auth record (no password for OAuth users)
      await connection.execute(
        "INSERT INTO auth (user_id, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [userId]
      );

      // Create profile record WITH auth_provider and email_verified
      await connection.execute(
        `INSERT INTO profiles 
         (id, email, first_name, last_name, full_name, facebook_id,
          auth_provider, email_verified, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, 'facebook', TRUE, NOW(), NOW())`,
        [
          userId,
          email,
          firstName,
          lastName,
          `${firstName} ${lastName}`,
          facebookId,
        ]
      );

      // Create subscription record
      await connection.execute(
        `INSERT INTO user_subscriptions 
         (id, user_id, plan_id, status, started_at, created_at, updated_at) 
         VALUES (?, ?, ?, 'active', NOW(), NOW(), NOW())`,
        [uuidv4(), userId, finalPlanId]
      );

      await connection.commit();
      connection.release();

      const token = jwt.sign(
        {
          userId: userId,
          email: email,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      console.log("✅ Facebook user registered successfully:", userId);

      // Send welcome email
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
        } else {
          const transactionId = `OAUTH_${Date.now()}_${uuidv4().substring(
            0,
            8
          )}`;
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
            console.error("Error fetching plan price:", error);
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
        }
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
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
    console.error("❌ Facebook registration error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to register Facebook user",
      error: error.message,
    });
  }
});

// Create user account from temporary data with plan selection
// Register-with-plan endpoint for frontend compatibility (free plan registration)
router.post("/register-with-plan", async (req, res) => {
  try {
    // Accepts: { email, password, firstName, lastName, phone, planId }
    const { email, password, firstName, lastName, phone, planId } = req.body;

    console.log(req.body, "---------------");
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

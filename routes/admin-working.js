import express from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { db } from "../config/knex.js";
import { sendDeadlineReminderEmail } from "../services/emailService.js";

const router = express.Router();

// Temporary middleware for testing
const tempRequireAdmin = (req, res, next) => {
  // For now, just pass through - we'll add proper auth later
  next();
};

// Get all users for admin panel
router.get("/users", tempRequireAdmin, async (req, res) => {
  try {
    console.log("Admin fetching users from database...");

    // Query to get all users with their profile information
    const users = await db("profiles as p")
      .select(
        "p.id",
        "p.email",
        "p.full_name",
        "p.first_name",
        "p.last_name",
        "p.role",
        "p.created_at",
        db.raw("p.updated_at as last_login")
      )
      .orderByRaw(`
        CASE 
          WHEN p.role = 'administrator' THEN 1
          WHEN p.role = 'premium_user' THEN 2
          WHEN p.role = 'user' THEN 3
          ELSE 4
        END
      `)
      .orderBy("p.created_at", "desc");

    console.log(`Found ${users.length} users in database`);

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Errore nel caricamento degli utenti",
      error: error.message,
    });
  }
});

// Delete user (admin only)
router.delete("/users/:id", tempRequireAdmin, async (req, res) => {
  try {
    const userId = req.params.id; // Keep as string for UUID
    console.log(`Admin attempting to delete user ${userId}`);

    // Check if user exists and is not an administrator
    const existingUsers = await db("profiles")
      .select("role")
      .where("id", userId);

    if (existingUsers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Utente non trovato",
      });
    }

    if (existingUsers[0].role === "administrator") {
      return res.status(403).json({
        success: false,
        message: "Non è possibile eliminare un amministratore",
      });
    }

    // Start transaction
    const trx = await db.transaction();

    try {
      // Delete from auth table first (foreign key constraint)
      await trx("auth").where("user_id", userId).delete();

      // Delete user subscriptions if table exists
      try {
        await trx("user_subscriptions").where("user_id", userId).delete();
      } catch (err) {
        // Table might not exist, continue
        console.log("user_subscriptions table might not exist, continuing...");
      }

      // Delete user from profiles
      await trx("profiles").where("id", userId).delete();

      await trx.commit();
      console.log(`User ${userId} deleted successfully`);

      res.json({
        success: true,
        message: "Utente eliminato con successo",
      });
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      message: "Errore durante l'eliminazione dell'utente",
      error: error.message,
    });
  }
});

// Update user role (admin only)
router.put("/users/:id/role", tempRequireAdmin, async (req, res) => {
  try {
    const userId = req.params.id; // Keep as string for UUID
    const { role } = req.body;

    console.log(`Admin updating user ${userId} role to ${role}`);

    // Validate role
    const validRoles = ["user", "premium_user", "administrator"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Ruolo non valido",
      });
    }

    // Check if user exists
    const existingUsers = await db("profiles")
      .select("id")
      .where("id", userId);

    if (existingUsers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Utente non trovato",
      });
    }

    // Update user role
    await db("profiles")
      .where("id", userId)
      .update({ role });

    console.log(`User ${userId} role updated to ${role} successfully`);

    res.json({
      success: true,
      message: "Ruolo aggiornato con successo",
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({
      success: false,
      message: "Errore durante l'aggiornamento del ruolo",
      error: error.message,
    });
  }
});

// IMPORTANT: Specific routes must come BEFORE parameterized routes
// Get questionnaire progress for all users (admin only)
router.get(
  "/users/questionnaire-progress",
  tempRequireAdmin,
  async (req, res) => {
    try {
      console.log(
        "✅ CORRECT ROUTE: Admin fetching questionnaire progress for all users"
      );

      // Get all users with their active subscriptions
      const users = await db("profiles as p")
        .select(
          "p.id as user_id",
          "us.id as subscription_id",
          "us.plan_id",
          "sp.name as plan_name"
        )
        .leftJoin("user_subscriptions as us", function() {
          this.on("p.id", "=", "us.user_id").andOn("us.status", "=", db.raw("'active'"));
        })
        .leftJoin("subscription_plans as sp", "us.plan_id", "sp.id")
        .orderBy("p.created_at", "desc");

      const progressData = {};

      // Process each user
      for (const user of users) {
        if (!user.plan_id) {
          // User has no active subscription
          progressData[user.user_id] = {
            totalQuestionnaires: 0,
            completedQuestionnaires: 0,
            percentage: 0,
            planName: null,
          };
          continue;
        }

        try {
          // Get total questionnaires for this plan
          const totalQuestionnaireCount = await db("plan_questionnaires as pq")
            .count("* as total")
            .where("pq.plan_id", user.plan_id)
            .first();

          const totalQuestionnaires = totalQuestionnaireCount.total;

          // Get completed questionnaires for this user and plan
          const completedQuestionnaireCount = await db("questionnaire_responses as qr")
            .countDistinct("qr.questionnaire_id as completed")
            .where("qr.user_id", user.user_id)
            .where("qr.plan_id", user.plan_id)
            .where("qr.status", "completed")
            .whereNotNull("qr.completed_at")
            .first();

          const completedQuestionnaires =
            completedQuestionnaireCount[0].completed;
          const percentage =
            totalQuestionnaires > 0
              ? (completedQuestionnaires / totalQuestionnaires) * 100
              : 0;

          progressData[user.user_id] = {
            totalQuestionnaires,
            completedQuestionnaires,
            percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
            planName: user.plan_name,
          };
        } catch (userError) {
          console.error(`Error processing user ${user.user_id}:`, userError);
          progressData[user.user_id] = {
            totalQuestionnaires: 0,
            completedQuestionnaires: 0,
            percentage: 0,
            planName: user.plan_name,
          };
        }
      }

      console.log(
        `Fetched progress data for ${Object.keys(progressData).length} users`
      );

      res.json({
        success: true,
        data: progressData,
      });
    } catch (error) {
      console.error("Error fetching all users questionnaire progress:", error);
      res.status(500).json({
        success: false,
        message:
          "Errore nel caricamento del progresso questionari per tutti gli utenti",
        error: error.message,
      });
    }
  }
);

// Get questionnaire progress for a specific user (admin only)
router.get(
  "/users/:id/questionnaire-progress",
  tempRequireAdmin,
  async (req, res) => {
    try {
      const userId = req.params.id;
      console.log(
        `✅ Admin fetching questionnaire progress for user ${userId}`
      );

      // Get user's active subscription and plan
      const subscriptions = await db("user_subscriptions as us")
        .select("us.id as subscription_id", "us.plan_id", "sp.name as plan_name")
        .leftJoin("subscription_plans as sp", "us.plan_id", "sp.id")
        .where("us.user_id", userId)
        .where("us.status", "active")
        .orderBy("us.created_at", "desc")
        .limit(1);

      if (subscriptions.length === 0) {
        return res.json({
          success: true,
          data: {
            totalQuestionnaires: 0,
            completedQuestionnaires: 0,
            percentage: 0,
            planName: null,
          },
        });
      }

      const subscription = subscriptions[0];

      // Get total questionnaires assigned to this plan
      const totalQuestionnaireCount = await db("plan_questionnaires as pq")
        .count("* as total")
        .where("pq.plan_id", subscription.plan_id)
        .first();

      const totalQuestionnaires = totalQuestionnaireCount.total;

      // Get completed questionnaires for this user and plan
      const completedQuestionnaireCount = await db("questionnaire_responses as qr")
        .countDistinct("qr.questionnaire_id as completed")
        .where("qr.user_id", userId)
        .where("qr.plan_id", subscription.plan_id)
        .where("qr.status", "completed")
        .whereNotNull("qr.completed_at")
        .first();

      const completedQuestionnaires = completedQuestionnaireCount.completed;
      const percentage =
        totalQuestionnaires > 0
          ? (completedQuestionnaires / totalQuestionnaires) * 100
          : 0;

      console.log(
        `User ${userId} progress: ${completedQuestionnaires}/${totalQuestionnaires} (${percentage.toFixed(
          1
        )}%)`
      );

      res.json({
        success: true,
        data: {
          totalQuestionnaires,
          completedQuestionnaires,
          percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
          planName: subscription.plan_name,
        },
      });
    } catch (error) {
      console.error("Error fetching questionnaire progress:", error);
      res.status(500).json({
        success: false,
        message: "Errore nel caricamento del progresso questionari",
        error: error.message,
      });
    }
  }
);

// Get user details (admin only) - This route must come AFTER specific routes
router.get("/users/:id", tempRequireAdmin, async (req, res) => {
  try {
    const userId = req.params.id; // Keep as string for UUID
    console.log(`Admin fetching details for user ${userId}`);

    // Query to get user details with profile info
    const users = await db("profiles as p")
      .select(
        "p.id",
        "p.email",
        "p.full_name",
        "p.first_name",
        "p.last_name",
        "p.role",
        "p.created_at",
        db.raw("p.updated_at as last_login")
      )
      .where("p.id", userId);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Utente non trovato",
      });
    }

    res.json({
      success: true,
      data: users[0],
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({
      success: false,
      message: "Errore nel caricamento dei dettagli utente",
      error: error.message,
    });
  }
});

// Create new user (admin only)
router.post("/users", tempRequireAdmin, async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      role = "user",
      subscription_plan,
    } = req.body;

    console.log("Admin creating new user:", {
      email,
      firstName,
      lastName,
      role,
    });

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "Email, password, nome e cognome sono obbligatori",
      });
    }

    // Validate role
    const validRoles = ["user", "premium_user", "administrator"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Ruolo non valido",
      });
    }

    // Check if user already exists
    const existingUsers = await db("profiles")
      .select("id")
      .where("email", email);

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Un utente con questa email esiste già",
      });
    }

    // Start transaction
    const trx = await db.transaction();

    try {
      // Generate UUID for user
      const userId = uuidv4();
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user profile
      await trx("profiles").insert({
        id: userId,
        email,
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
        role,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      // Create auth record
      await trx("auth").insert({
        user_id: userId,
        password_hash: hashedPassword,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

      // Add subscription if provided
      if (subscription_plan) {
        await trx("user_subscriptions").insert({
          id: uuidv4(),
          user_id: userId,
          plan_id: subscription_plan,
          status: "active",
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
        });
      }

      await trx.commit();

      console.log(`User ${userId} created successfully by admin`);

      // Return created user data
      const newUser = await db("profiles as p")
        .select(
          "p.id",
          "p.email",
          "p.full_name",
          "p.first_name",
          "p.last_name",
          "p.role",
          "p.created_at",
          db.raw("p.updated_at as last_login")
        )
        .where("p.id", userId)
        .first();

      res.status(201).json({
        success: true,
        message: "Utente creato con successo",
        data: newUser,
      });
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({
      success: false,
      message: "Errore durante la creazione dell'utente",
      error: error.message,
    });
  }
});
router.get("/users/incomplete-plans", tempRequireAdmin, async (req, res) => {
  try {
    const users = await db("profiles as p")
      .select(
        "p.id",
        "p.email",
        "p.full_name",
        "p.first_name",
        "p.last_name",
        "up.plan_id",
        db.raw("pl.name as plan_name"),
        db.raw("up.created_at as plan_start_date"),
        db.raw("COUNT(DISTINCT pq.questionnaire_id) as total_questionnaires"),
        db.raw("COUNT(DISTINCT uqr.questionnaire_id) as completed_questionnaires"),
        db.raw("(COUNT(DISTINCT uqr.questionnaire_id) * 100.0 / NULLIF(COUNT(DISTINCT pq.questionnaire_id), 0)) as completion_percentage")
      )
      .innerJoin("user_plans as up", "p.id", "up.user_id")
      .innerJoin("plans as pl", "up.plan_id", "pl.id")
      .innerJoin("plan_questionnaires as pq", "pl.id", "pq.plan_id")
      .leftJoin("user_questionnaire_responses as uqr", function() {
        this.on("p.id", "=", "uqr.user_id")
          .andOn("pq.questionnaire_id", "=", "uqr.questionnaire_id")
          .andOn("uqr.completed", "=", db.raw("true"));
      })
      .where("up.completed", false)
      .groupBy(
        "p.id",
        "p.email",
        "p.full_name",
        "p.first_name",
        "p.last_name",
        "up.plan_id",
        "pl.name",
        "up.created_at"
      )
      .havingRaw("completion_percentage < 100 OR completion_percentage IS NULL")
      .orderByRaw("completion_percentage ASC, up.created_at ASC");

    res.json({
      success: true,
      data: users,
      count: users.length,
    });
  } catch (error) {
    console.error("Error fetching users with incomplete plans:", error);
    res.status(500).json({
      success: false,
      message: "Errore nel caricamento degli utenti con piani incompleti",
      error: error.message,
    });
  }
});

// Send deadline reminder emails to users
router.post(
  "/users/send-deadline-reminders",
  tempRequireAdmin,
  async (req, res) => {
    try {
      const { userIds } = req.body;
      console.log("Sending deadline reminders to user IDs:", userIds);

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "È necessario fornire almeno un ID utente",
        });
      }

      // Get user details with their incomplete plans
      const users = await db("profiles as p")
        .select(
          "p.id",
          "p.email",
          "p.full_name",
          "p.first_name",
          "p.last_name",
          db.raw("sp.name as plan_name"),
          db.raw("COUNT(DISTINCT pq.questionnaire_id) as total_questionnaires"),
          db.raw("COUNT(DISTINCT CASE WHEN qr.completed_at IS NOT NULL THEN qr.questionnaire_id END) as completed_questionnaires"),
          db.raw("(COUNT(DISTINCT pq.questionnaire_id) - COUNT(DISTINCT CASE WHEN qr.completed_at IS NOT NULL THEN qr.questionnaire_id END)) as remaining_questionnaires")
        )
        .innerJoin("user_subscriptions as us", "p.id", "us.user_id")
        .innerJoin("subscription_plans as sp", "us.plan_id", "sp.id")
        .innerJoin("plan_questionnaires as pq", "sp.id", "pq.plan_id")
        .leftJoin("questionnaire_responses as qr", function() {
          this.on("p.id", "=", "qr.user_id")
            .andOn("pq.questionnaire_id", "=", "qr.questionnaire_id");
        })
        .whereIn("p.id", userIds)
        .where("us.status", "active")
        .groupBy("p.id", "p.email", "p.full_name", "p.first_name", "p.last_name", "sp.name")
        .havingRaw("remaining_questionnaires > 0");

      console.log(`Found ${users.length} users with incomplete plans`);

      if (users.length === 0) {
        return res.json({
          success: true,
          message: "Nessun utente con piani incompleti trovato",
          data: { emailsSent: 0, recipients: [] },
        });
      }

      const emailResults = [];
      const failedEmails = [];

      for (const user of users) {
        try {
          await sendDeadlineReminderEmail({
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            fullName: user.full_name,
            planName: user.plan_name,
            totalQuestionnaires: user.total_questionnaires,
            completedQuestionnaires: user.completed_questionnaires,
            remainingQuestionnaires: user.remaining_questionnaires,
          });

          emailResults.push({
            userId: user.id,
            email: user.email,
            status: "sent",
          });

          console.log(`✅ Email sent successfully to ${user.email}`);
        } catch (emailError) {
          console.error(
            `❌ Failed to send email to ${user.email}:`,
            emailError
          );
          failedEmails.push({
            userId: user.id,
            email: user.email,
            status: "failed",
            error: emailError.message,
          });
        }
      }

      res.json({
        success: true,
        message: `Email di promemoria inviate: ${emailResults.length} successi, ${failedEmails.length} falliti`,
        data: {
          emailsSent: emailResults.length,
          emailsFailed: failedEmails.length,
          recipients: emailResults,
          failed: failedEmails,
        },
      });
    } catch (error) {
      console.error("Error sending deadline reminder emails:", error);
      res.status(500).json({
        success: false,
        message: "Errore nell'invio delle email di promemoria",
        error: error.message,
      });
    }
  }
);
export default router;

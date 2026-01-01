import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/**
 * Get questionnaires with access status for a user based on their plan
 */
router.get("/user-questionnaires-with-access", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId parameter is required",
      });
    }

    // 1. Get user's active subscription and plan details
    const [userPlanRows] = await pool.query(
      `
      SELECT 
        us.id as subscription_id,
        us.plan_id,
        us.started_at,
        us.current_sequence,
        us.current_attempt,
        sp.name as plan_name,
        sp.options as plan_options
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = ? AND us.status = 'active'
      LIMIT 1
    `,
      [userId]
    );

    let userPlan = userPlanRows[0];

    // Fallback: if user has no active subscription, try to use a free/default plan
    if (!userPlan) {
      const [freePlanRows] = await pool.query(
        `
        SELECT id as plan_id, name as plan_name, options as plan_options
        FROM subscription_plans
        WHERE is_free = 1 OR price = 0
        ORDER BY created_at ASC
        LIMIT 1
      `
      );

      if (freePlanRows.length === 0) {
        return res.json({
          success: true,
          message: "No active subscription and no free plan available",
          data: [],
        });
      }

      userPlan = {
        subscription_id: null,
        plan_id: freePlanRows[0].plan_id,
        plan_name: freePlanRows[0].plan_name,
        plan_options: freePlanRows[0].plan_options,
        started_at: null,
        current_sequence: 0,
        current_attempt: 1,
      };
    }
    const planOptions =
      typeof userPlan.plan_options === "string"
        ? JSON.parse(userPlan.plan_options)
        : userPlan.plan_options || {};

    // 2. Get questionnaires for this plan
    const [questionnaireRows] = await pool.query(
      `
      SELECT 
        qc.id,
        qc.title,
        qc.description,
        pq.sequence_order
      FROM plan_questionnaires pq
      JOIN questionnaire_config qc ON pq.questionnaire_id = qc.id
      WHERE pq.plan_id = ? AND qc.status = 'published'
      ORDER BY pq.sequence_order ASC
    `,
      [userPlan.plan_id]
    );

    // 3. Get user's completion history for these questionnaires (ONLY for current subscription)
    const questionnaireIds = questionnaireRows.map((q) => q.id);
    let completionHistory = [];

    if (questionnaireIds.length > 0) {
      const [completionRows] = await pool.query(
        `
        SELECT 
          questionnaire_id,
          attempt_number,
          completed_at,
          status
        FROM questionnaire_responses
        WHERE user_id = ? 
          AND (subscription_id = ? OR ? IS NULL)
          AND questionnaire_id IN (${questionnaireIds
            .map(() => "?")
            .join(",")})
        ORDER BY questionnaire_id, attempt_number DESC
      `,
        [userId, userPlan.subscription_id, userPlan.subscription_id, ...questionnaireIds]
      );

      // Group completions by questionnaire
      completionHistory = completionRows.reduce((acc, completion) => {
        if (!acc[completion.questionnaire_id]) {
          acc[completion.questionnaire_id] = [];
        }
        acc[completion.questionnaire_id].push(completion);
        return acc;
      }, {});
    }

    // 4. Calculate access status for each questionnaire
    const questionnairesWithAccess = questionnaireRows.map((questionnaire) => {
      const completions = completionHistory[questionnaire.id] || [];

      // Pass the full questionnaire list and completion history for progress questionnaires
      const access = calculateQuestionnaireAccess(
        questionnaire,
        completions,
        planOptions,
        userPlan,
        questionnaireRows, // Pass all questionnaires for sequence checking
        completionHistory // Pass full completion history
      );

      return {
        id: questionnaire.id,
        title: questionnaire.title,
        description: questionnaire.description,
        sequence_order: questionnaire.sequence_order,
        status: access.status,
        canAccess: access.canAccess,
        reason: access.reason,
        nextAvailableDate: access.nextAvailableDate,
        completionCount: completions.filter((c) => c.status === "completed")
          .length,
        lastCompletedAt:
          completions.length > 0 ? completions[0].completed_at : null,
      };
    });

    res.json({
      success: true,
      data: questionnairesWithAccess,
      planInfo: {
        planId: userPlan.plan_id,
        planName: userPlan.plan_name,
        planOptions: planOptions,
      },
    });
  } catch (error) {
    console.error("Error fetching user questionnaires with access:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch questionnaires: " + error.message,
    });
  }
});

/**
 * Calculate questionnaire access based on plan type and completion history
 */
function calculateQuestionnaireAccess(
  questionnaire,
  completions,
  planOptions,
  userPlan,
  allQuestionnaires = null,
  allCompletionHistory = null
) {
  if (!planOptions) {
    console.log("No plan options available");
    return {
      canAccess: false,
      status: "plan_required",
      reason: "Piano richiesto per accedere ai questionari",
    };
  }

  const completedAttempts = completions.filter((c) => c.status === "completed");
  const completionCount = completedAttempts.length;
  const lastCompletedDate =
    completedAttempts.length > 0
      ? new Date(completedAttempts[0].completed_at)
      : null;
  const now = new Date();

  console.log("Plan type being checked:", userPlan.plan_type);

  // Multiple Questionnaires Plan - Unlimited access
  if (planOptions.multipleQuestionnaires) {
    return {
      status: "available",
      canAccess: true,
      reason: "Accesso illimitato con il tuo piano",
    };
  }

  // Verification After Plan - Max 2 attempts with waiting period
  if (planOptions.verificationAfter) {
    if (completionCount === 0) {
      return {
        status: "available",
        canAccess: true,
        reason: "Prima compilazione disponibile",
      };
    } else if (completionCount === 1) {
      if (lastCompletedDate) {
        const nextAvailable = new Date(lastCompletedDate);
        nextAvailable.setDate(
          nextAvailable.getDate() + (planOptions.verificationPeriod || 90)
        );

        if (now >= nextAvailable) {
          return {
            status: "available",
            canAccess: true,
            reason: "Seconda compilazione disponibile",
          };
        } else {
          const daysRemaining = Math.ceil(
            (nextAvailable.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          return {
            status: "waiting",
            canAccess: false,
            reason: `Disponibile tra ${daysRemaining} giorni`,
            nextAvailableDate: nextAvailable.toLocaleDateString("it-IT"),
          };
        }
      } else {
        return {
          status: "waiting",
          canAccess: false,
          reason: "Periodo di verifica in corso",
        };
      }
    } else {
      return {
        status: "locked",
        canAccess: false,
        reason: "Limite di 2 compilazioni raggiunto",
      };
    }
  }

  // Periodic Questionnaires Plan - Based on maxRepetitions and verificationPeriod
  if (planOptions.periodicQuestionnaires) {
    const maxReps = planOptions.maxRepetitions || 1;
    const verificationPeriod = planOptions.verificationPeriod || 30; // Default 30 days if not specified

    // Check if user has reached the maximum repetitions limit
    if (completionCount >= maxReps) {
      return {
        status: "locked",
        canAccess: false,
        reason: `Limite di ${maxReps} compilazioni raggiunto per questo periodo`,
      };
    }

    // If no completions yet, allow first attempt
    if (completionCount === 0) {
      return {
        status: "available",
        canAccess: true,
        reason: "Prima compilazione disponibile",
      };
    }

    // If user has completions but under the limit, check waiting period
    if (completionCount < maxReps && lastCompletedDate) {
      const nextAvailable = new Date(lastCompletedDate);
      nextAvailable.setDate(nextAvailable.getDate() + verificationPeriod);

      if (now >= nextAvailable) {
        return {
          status: "available",
          canAccess: true,
          reason: `Compilazione ${
            completionCount + 1
          } di ${maxReps} disponibile`,
        };
      } else {
        const daysRemaining = Math.ceil(
          (nextAvailable.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        return {
          status: "waiting",
          canAccess: false,
          reason: `Prossima compilazione disponibile tra ${daysRemaining} giorni (${completionCount}/${maxReps} completate)`,
          nextAvailableDate: nextAvailable.toLocaleDateString("it-IT"),
        };
      }
    }

    // Fallback case (shouldn't reach here normally)
    return {
      status: "waiting",
      canAccess: false,
      reason: "In attesa del prossimo periodo",
    };
  }

  // Progress Questionnaires Plan - Sequential access with waiting periods
  if (planOptions.progressQuestionnaires) {
    const { minWaitingPeriod = 30 } = planOptions;
    console.log("ProgressQuestionnaires - minWaitingPeriod:", minWaitingPeriod);

    // For the first questionnaire in sequence (sequence_order = 1), always allow access
    if (questionnaire.sequence_order === 1) {
      console.log(
        "This is the first questionnaire (sequence_order = 1), allowing access"
      );

      // Check if already completed
      if (completionCount > 0) {
        console.log("First questionnaire already completed");
        return {
          status: "completed",
          canAccess: false,
          reason: "Questionario già completato",
        };
      }

      return {
        status: "available",
        canAccess: true,
        reason: "Primo questionario disponibile",
      };
    }

    // For subsequent questionnaires, need to check previous questionnaire completion
    console.log("Checking for previous questionnaire completion...");

    if (!allQuestionnaires || !allCompletionHistory) {
      console.log("Missing questionnaire context for progress checking");
      return {
        status: "locked",
        canAccess: false,
        reason: "Completa prima il questionario precedente",
      };
    }

    // Find the previous questionnaire in sequence
    const previousSequenceOrder = questionnaire.sequence_order - 1;
    console.log(
      "Looking for previous questionnaire with sequence_order:",
      previousSequenceOrder
    );

    const previousQuestionnaire = allQuestionnaires.find(
      (q) => q.sequence_order === previousSequenceOrder
    );
    console.log("Previous questionnaire found:", previousQuestionnaire?.id);

    if (!previousQuestionnaire) {
      console.log("No previous questionnaire found in sequence");
      return {
        status: "locked",
        canAccess: false,
        reason: "Sequenza questionari non valida",
      };
    }

    // Check if previous questionnaire is completed
    const previousCompletions =
      allCompletionHistory[previousQuestionnaire.id] || [];
    const previousCompleted = previousCompletions.filter(
      (c) => c.status === "completed"
    );

    console.log(
      "Previous questionnaire completions:",
      previousCompleted.length
    );

    if (previousCompleted.length === 0) {
      console.log("Previous questionnaire not completed yet");
      return {
        status: "locked",
        canAccess: false,
        reason: "Completa prima il questionario precedente",
      };
    }

    // Check if current questionnaire is already completed
    if (completionCount > 0) {
      console.log("Current questionnaire already completed");
      return {
        status: "completed",
        canAccess: false,
        reason: "Questionario già completato",
      };
    }

    // Check waiting period from previous questionnaire completion
    const previousCompletion = previousCompleted[0]; // Most recent completion
    const lastCompletionDate = new Date(previousCompletion.completed_at);
    const nextAvailable = new Date(lastCompletionDate);
    nextAvailable.setDate(nextAvailable.getDate() + minWaitingPeriod);

    console.log("Previous completion date:", lastCompletionDate);
    console.log("Next available date:", nextAvailable);
    console.log("Current date:", now);
    console.log("Can access now?", now >= nextAvailable);

    if (now < nextAvailable) {
      const daysToWait = Math.ceil(
        (nextAvailable - now) / (1000 * 60 * 60 * 24)
      );
      console.log("Still in waiting period, days to wait:", daysToWait);
      return {
        status: "waiting",
        canAccess: false,
        reason: `Disponibile tra ${daysToWait} giorni`,
        nextAvailableDate: nextAvailable.toLocaleDateString("it-IT"),
      };
    }

    console.log("Waiting period passed, questionnaire available");
    return {
      status: "available",
      canAccess: true,
      reason: "Questionario disponibile",
    };
  }

  // Single Questionnaire Plan - One-time access only
  if (
    planOptions.singleQuestionnaire ||
    (!planOptions.multipleQuestionnaires &&
      !planOptions.verificationAfter &&
      !planOptions.periodicQuestionnaires &&
      !planOptions.progressQuestionnaires)
  ) {
    if (completionCount === 0) {
      return {
        status: "available",
        canAccess: true,
        reason: "Disponibile per la compilazione",
      };
    } else {
      return {
        status: "completed",
        canAccess: false,
        reason: "Questionario già completato",
      };
    }
  }

  // Default fallback
  return {
    status: "available",
    canAccess: true,
    reason: "Disponibile",
  };
}

export default router;

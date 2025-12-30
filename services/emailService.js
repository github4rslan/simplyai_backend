// --- Password Reset Email ---
export async function sendResetPasswordEmail(to, resetUrl) {
  const mailOptions = {
    from: DEFAULT_SENDER,
    to,
    subject: "Reset your password",
    html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link will expire in 1 hour.</p>`,
  };

  if (!emailEnabled) {
    console.log(
      "⚠️ Email not configured, logging password reset email content instead:"
    );
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📧 PASSWORD RESET EMAIL (Would be sent to:", to, ")");
    console.log("Subject: Reset your password");
    console.log("Reset URL:", resetUrl);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return {
      success: true,
      messageId: "simulated-" + Date.now(),
      note: "Email logged to console (email not configured)",
    };
  }

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(
      `✅ Password reset email sent successfully via ${emailProvider}:`,
      result.messageId
    );
    return {
      success: true,
      messageId: result.messageId,
      provider: emailProvider,
    };
  } catch (error) {
    console.error(
      `❌ Failed to send password reset email via ${emailProvider}:`,
      error.message
    );

    // Fallback to console logging
    console.log("📧 FALLBACK - Logging password reset email to console:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📧 PASSWORD RESET EMAIL (Failed to send to:", to, ")");
    console.log("Subject: Reset your password");
    console.log("Reset URL:", resetUrl);
    console.log("Error:", error.message);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return {
      success: true, // Return success so the reset process continues
      messageId: "fallback-" + Date.now(),
      note: "Email logged to console (SMTP failed)",
      error: error.message,
    };
  }
}

import nodemailer from "nodemailer";
import { appConfig } from "../config/app.js";

const {
  email: { gmail, brevo },
  server: { frontendUrl },
} = appConfig;

const DEFAULT_SENDER = gmail.address || brevo.address || "no-reply@simplyai.it";
const FRONTEND_URL = frontendUrl || "http://localhost:8081";

// Create transporter with Gmail SMTP (priority) or Brevo as fallback
let transporter;
let emailEnabled = false;
let emailProvider = "";

try {
  // Try Gmail SMTP first (recommended)
  if (gmail.address && gmail.appPassword) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmail.address,
        pass: gmail.appPassword,
      },
    });
    emailProvider = "Gmail";
    console.log("✅ Gmail SMTP transporter initialized");
    emailEnabled = true;
  }
  // Fallback to Brevo if Gmail not configured
  else if (brevo.address && brevo.apiKey) {
    transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      auth: {
        user: brevo.address,
        pass: brevo.apiKey,
      },
    });
    emailProvider = "Brevo";
    console.log("✅ Brevo SMTP transporter initialized (fallback)");
    emailEnabled = true;
  } else {
    console.log("⚠️ No email credentials found, using console logging");
    emailEnabled = false;
  }
} catch (error) {
  console.log("❌ Failed to initialize email transporter:", error.message);
  emailEnabled = false;
}

// Send payment confirmation notification email
export const sendPaymentNotificationEmail = async (
  data,
  paymentInfo = null,
  planInfo = null
) => {
  try {
    // Handle both old calling pattern (3 params) and new calling pattern (1 object)
    let userInfo, paymentData, planData;

    if (
      typeof data === "object" &&
      data.email &&
      data.firstName &&
      data.lastName
    ) {
      // New calling pattern - single object with all data
      userInfo = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
      };
      paymentData = {
        method: data.paymentMethod || "Registrazione Online",
        transactionId: data.transactionId || "REG-" + Date.now(),
        amount: data.planPrice || 0,
        isFreeRegistration: data.isFreeRegistration,
      };
      planData = {
        name: data.planName || "Piano Selezionato",
        price: data.planPrice || 0,
        type: data.planType || "Mensile",
      };
    } else {
      // Old calling pattern - three separate parameters
      userInfo = data;
      paymentData = paymentInfo;
      planData = planInfo;
    }

    console.log("📧 Email template debug information:");
    console.log("- User Info:", JSON.stringify(userInfo, null, 2));
    console.log("- Payment Data:", JSON.stringify(paymentData, null, 2));
    console.log("- Plan Data:", JSON.stringify(planData, null, 2));

    // Generate the HTML template
    const htmlTemplate = generatePaymentNotificationTemplate(
      userInfo,
      paymentData,
      planData
    );

    // If email is not properly configured, log the email content instead
    if (!emailEnabled) {
      console.log("⚠️ Email not configured, logging email content instead:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(
        "📧 EMAIL NOTIFICATION (Would be sent to:",
        userInfo.email,
        ")"
      );
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Subject: 🎉 Benvenuto in SimolyAI -", planData.name + "!");
      console.log("User:", userInfo.firstName, userInfo.lastName);
      console.log(
        "Plan:",
        planData.name,
        "- €" + (planData.price / 100).toFixed(2)
      );
      console.log("Payment Method:", paymentData.method);
      console.log("Transaction ID:", paymentData.transactionId);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      return {
        success: true,
        messageId: "simulated-" + Date.now(),
        note: "Email logged to console (email not configured)",
      };
    }

    const senderEmail = DEFAULT_SENDER;
    const mailOptions = {
      from: `"SimolyAI" <${senderEmail}>`,
      to: userInfo.email,
      subject: `🎉 Benvenuto in SimolyAI - ${planData.name}!`,
      html: htmlTemplate,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(
      `✅ Payment notification email sent successfully via ${emailProvider}:`,
      result.messageId
    );
    return {
      success: true,
      messageId: result.messageId,
      provider: emailProvider,
    };
  } catch (error) {
    console.error(
      `❌ Error sending payment notification email via ${emailProvider}:`,
      error.message
    );

    // Log the email content as fallback
    console.log("📧 FALLBACK - Logging email content to console:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(
      "📧 EMAIL NOTIFICATION (Failed to send to:",
      userInfo.email,
      ")"
    );
    console.log("Subject: 🎉 Benvenuto in SimolyAI -", planData.name + "!");
    console.log("User:", userInfo.firstName, userInfo.lastName);
    console.log(
      "Plan:",
      planData.name,
      "- €" + (planData.price / 100).toFixed(2)
    );
    console.log("Payment Method:", paymentData.method);
    console.log("Transaction ID:", paymentData.transactionId);
    console.log("Provider:", emailProvider);
    console.log("Error:", error.message);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return {
      success: false,
      error: error.message,
      provider: emailProvider,
      fallback: "Email content logged to console",
    };
  }
};

// Generate HTML email template for payment notification
const generatePaymentNotificationTemplate = (
  userInfo,
  paymentInfo,
  planInfo
) => {
  const currentDate = new Date().toLocaleDateString("it-IT", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Check if this is a free registration - prioritize explicit flag, then check price
  const isFreeRegistration =
    paymentInfo && paymentInfo.isFreeRegistration !== undefined
      ? paymentInfo.isFreeRegistration
      : !planInfo.price || planInfo.price === 0;

  console.log("🔍 Template Debug:", {
    planInfoPrice: planInfo.price,
    paymentInfoIsFree: paymentInfo
      ? paymentInfo.isFreeRegistration
      : "undefined",
    calculatedIsFree: isFreeRegistration,
    paymentMethod: paymentInfo ? paymentInfo.method : "undefined",
    transactionId: paymentInfo ? paymentInfo.transactionId : "undefined",
  });

  const headerTitle = isFreeRegistration
    ? "🎉 Benvenuto in SimolyAI!"
    : "🎉 Pagamento Completato!";
  const welcomeMessage = isFreeRegistration
    ? "La tua registrazione è stata completata con successo! Benvenuto in <strong>SimolyAI</strong>."
    : "Il tuo pagamento è stato elaborato con successo! Benvenuto in <strong>SimolyAI</strong>. Di seguito trovi i dettagli della tua transazione:";

  return `
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${
        isFreeRegistration ? "Registrazione Completata" : "Payment Confirmation"
      } - SimolyAI</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 40px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .content { padding: 40px; }
        .success-icon { text-align: center; margin-bottom: 30px; }
        .success-icon .icon { width: 80px; height: 80px; background-color: #28a745; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 40px; color: white; }
        .greeting { font-size: 18px; margin-bottom: 20px; color: #2c3e50; }
        .info-section { background-color: #f8f9fa; border-radius: 8px; padding: 25px; margin: 25px 0; }
        .info-title { font-size: 16px; font-weight: 600; color: #495057; margin-bottom: 15px; border-bottom: 2px solid #e9ecef; padding-bottom: 8px; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px 0; border-bottom: 1px solid #e9ecef; }
        .info-row:last-child { border-bottom: none; margin-bottom: 0; }
        .info-label { font-weight: 500; color: #6c757d; }
        .info-value { font-weight: 600; color: #2c3e50; }
        .highlight { background-color: #e7f3ff; border-left: 4px solid #007bff; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 25px 0; text-align: center; }
        .footer { background-color: #2c3e50; color: #ecf0f1; padding: 30px 40px; text-align: center; font-size: 14px; }
        .footer a { color: #3498db; text-decoration: none; }
        .divider { border: none; border-top: 2px solid #e9ecef; margin: 30px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${headerTitle}</h1>
        </div>
        
        <div class="content">
          <div class="success-icon">
            <div class="icon">✓</div>
          </div>
          
          <div class="greeting">
            Ciao <strong>${userInfo.firstName || userInfo.name}</strong>,
          </div>
          
          <p>${welcomeMessage}</p>
          
          <div class="info-section">
            <div class="info-title">👤 Informazioni Account</div>
            <div class="info-row">
              <span class="info-label">Nome:</span>
              <span class="info-value">${userInfo.firstName || ""} ${
    userInfo.lastName || ""
  }</span>
            </div>
            <div class="info-row">
              <span class="info-label">Email:</span>
              <span class="info-value">${userInfo.email}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Data Registrazione:</span>
              <span class="info-value">${currentDate}</span>
            </div>
          </div>
          
          <div class="info-section">
            <div class="info-title">📋 Dettagli Piano</div>
            <div class="info-row">
              <span class="info-label">Piano Selezionato:</span>
              <span class="info-value">${planInfo.name}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Prezzo:</span>
              <span class="info-value">${
                isFreeRegistration
                  ? "Gratuito"
                  : "€" + (planInfo.price / 100).toFixed(2)
              }</span>
            </div>
            <div class="info-row">
              <span class="info-label">Tipo:</span>
              <span class="info-value">${planInfo.type || "Mensile"}</span>
            </div>
          </div>
          
          ${
            !isFreeRegistration
              ? `
          <div class="info-section">
            <div class="info-title">💳 Informazioni Pagamento</div>
            <div class="info-row">
              <span class="info-label">Metodo di Pagamento:</span>
              <span class="info-value">${paymentInfo.method}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Importo Totale:</span>
              <span class="info-value">€${(
                (paymentInfo.amount || planInfo.price) / 100
              ).toFixed(2)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">ID Transazione:</span>
              <span class="info-value">${paymentInfo.transactionId}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Stato:</span>
              <span class="info-value" style="color: #28a745;">✅ Completato</span>
            </div>
          </div>
          `
              : ""
          }
          
          <div class="highlight">
            <strong>🚀 Il tuo account è ora attivo!</strong><br>
            Puoi iniziare subito a utilizzare tutte le funzionalità del tuo piano ${
              planInfo.name
            }.
          </div>
          
          <div style="text-align: center;">
            <a href="${
              FRONTEND_URL
            }/dashboard" class="cta-button">
              Accedi alla Dashboard
            </a>
          </div>
          
          <hr class="divider">
          
          <p>Se hai domande o hai bisogno di assistenza, non esitare a contattarci:</p>
          <ul>
            <li>📧 Email: support@simolyai.com</li>
            <li>📞 Telefono: +39 XXX XXX XXXX</li>
            <li>💬 Chat: Disponibile dalla dashboard</li>
          </ul>
          
          <p>Grazie per aver scelto <strong>SimolyAI</strong>!</p>
        </div>
        
        <div class="footer">
          <p>
            © 2024 SimolyAI. Tutti i diritti riservati.<br>
            <a href="${
              FRONTEND_URL
            }/privacy-policy">Privacy Policy</a> | 
            <a href="${
              FRONTEND_URL
            }/terms-of-service">Termini di Servizio</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};
// Add this function to your existing emailService.js file

/**
 * Send deadline reminder email to user with incomplete plan
 */
export const sendDeadlineReminderEmail = async ({
  email,
  firstName,
  lastName,
  fullName,
  planName,
  totalQuestionnaires,
  completedQuestionnaires,
  remainingQuestionnaires,
}) => {
  try {
    const userName = firstName || fullName || "Utente";
    const completionPercentage = Math.round(
      (completedQuestionnaires / totalQuestionnaires) * 100
    );

    console.log("📧 Deadline reminder email debug information:");
    console.log("- User:", userName, email);
    console.log("- Plan:", planName);
    console.log(
      "- Progress:",
      completedQuestionnaires,
      "/",
      totalQuestionnaires
    );

    // Generate the HTML template
    const htmlTemplate = generateDeadlineReminderTemplate({
      userName,
      planName,
      totalQuestionnaires,
      completedQuestionnaires,
      remainingQuestionnaires,
      completionPercentage,
    });

    // If email is not properly configured, log the email content instead
    if (!emailEnabled) {
      console.log("⚠️ Email not configured, logging email content instead:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📧 DEADLINE REMINDER (Would be sent to:", email, ")");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Subject: Promemoria: Completa il tuo piano", planName);
      console.log("User:", userName);
      console.log(
        "Progress:",
        completedQuestionnaires,
        "/",
        totalQuestionnaires
      );
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      return {
        success: true,
        messageId: "simulated-" + Date.now(),
        note: "Email logged to console (email not configured)",
      };
    }

    const senderEmail = DEFAULT_SENDER;
    const mailOptions = {
      from: `"SimolyAI" <${senderEmail}>`,
      to: email,
      subject: `Promemoria: Completa il tuo piano ${planName}`,
      html: htmlTemplate,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(
      `✅ Deadline reminder email sent successfully via ${emailProvider}:`,
      result.messageId
    );
    return {
      success: true,
      messageId: result.messageId,
      provider: emailProvider,
    };
  } catch (error) {
    console.error(
      `❌ Error sending deadline reminder email via ${emailProvider}:`,
      error.message
    );

    // Log the email content as fallback
    console.log("📧 FALLBACK - Logging email content to console:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📧 DEADLINE REMINDER (Failed to send to:", email, ")");
    console.log("Subject: Promemoria: Completa il tuo piano", planName);
    console.log("User:", userName);
    console.log("Progress:", completedQuestionnaires, "/", totalQuestionnaires);
    console.log("Provider:", emailProvider);
    console.log("Error:", error.message);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return {
      success: false,
      error: error.message,
      provider: emailProvider,
      fallback: "Email content logged to console",
    };
  }
};

// Generate HTML email template for deadline reminder
const generateDeadlineReminderTemplate = ({
  userName,
  planName,
  totalQuestionnaires,
  completedQuestionnaires,
  remainingQuestionnaires,
  completionPercentage,
}) => {
  return `
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Promemoria Piano - SimolyAI</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 40px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .content { padding: 40px; }
        .reminder-icon { text-align: center; margin-bottom: 30px; }
        .reminder-icon .icon { width: 80px; height: 80px; background-color: #ffc107; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 40px; color: white; }
        .greeting { font-size: 18px; margin-bottom: 20px; color: #2c3e50; }
        .progress-section { background-color: #f8f9fa; border-radius: 8px; padding: 25px; margin: 25px 0; border-left: 4px solid #7c3aed; }
        .progress-title { font-size: 16px; font-weight: 600; color: #495057; margin-bottom: 20px; }
        .progress-stats { font-size: 18px; font-weight: bold; color: #2c3e50; margin-bottom: 15px; }
        .progress-bar-container { width: 100%; height: 30px; background-color: #e0e0e0; border-radius: 15px; overflow: hidden; margin-bottom: 15px; }
        .progress-bar { height: 100%; background: linear-gradient(90deg, #7c3aed 0%, #a855f7 100%); transition: width 0.3s ease; }
        .progress-percentage { text-align: center; font-size: 24px; font-weight: bold; color: #7c3aed; }
        .remaining-info { margin-top: 20px; padding: 15px; background-color: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 25px 0; text-align: center; }
        .footer { background-color: #2c3e50; color: #ecf0f1; padding: 30px 40px; text-align: center; font-size: 14px; }
        .footer a { color: #3498db; text-decoration: none; }
        .divider { border: none; border-top: 2px solid #e9ecef; margin: 30px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Promemoria Piano</h1>
        </div>
        
        <div class="content">
          <div class="reminder-icon">
            <div class="icon">⏰</div>
          </div>
          
          <div class="greeting">
            Ciao <strong>${userName}</strong>,
          </div>
          
          <p>Questo è un gentile promemoria riguardo al tuo piano "<strong style="color: #7c3aed;">${planName}</strong>".</p>
          
          <div class="progress-section">
            <div class="progress-title">📊 Stato del Piano</div>
            
            <div class="progress-stats">
              ${completedQuestionnaires} su ${totalQuestionnaires} questionari completati
            </div>
            
            <div class="progress-bar-container">
              <div class="progress-bar" style="width: ${completionPercentage}%;"></div>
            </div>
            
            <div class="progress-percentage">
              ${completionPercentage}%
            </div>
            
            <div class="remaining-info">
              <strong>Ti rimangono ${remainingQuestionnaires} questionari</strong> da completare per finire il tuo piano.
            </div>
          </div>
          
          <p>Completare i questionari ti aiuterà a ottenere il massimo dal tuo piano personalizzato e a raggiungere i tuoi obiettivi.</p>
          
          <div style="text-align: center;">
            <a href="${
              FRONTEND_URL
            }/dashboard" class="cta-button">
              Vai al Dashboard →
            </a>
          </div>
          
          <hr class="divider">
          
          <p>Se hai domande o hai bisogno di assistenza, non esitare a contattarci:</p>
          <ul>
            <li>📧 Email: support@simolyai.com</li>
            <li>📞 Telefono: +39 XXX XXX XXXX</li>
            <li>💬 Chat: Disponibile dalla dashboard</li>
          </ul>
          
          <p>Grazie per utilizzare <strong>SimolyAI</strong>!</p>
        </div>
        
        <div class="footer">
          <p>
            © 2024 SimolyAI. Tutti i diritti riservati.<br>
            <a href="${
              FRONTEND_URL
            }/privacy-policy">Privacy Policy</a> | 
            <a href="${
              FRONTEND_URL
            }/terms-of-service">Termini di Servizio</a>
          </p>
          <p style="color: #95a5a6; font-size: 12px; margin-top: 15px;">
            Hai ricevuto questa email perché sei registrato sulla nostra piattaforma.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};
export default {
  sendPaymentNotificationEmail,
  sendResetPasswordEmail,
  sendDeadlineReminderEmail,
};

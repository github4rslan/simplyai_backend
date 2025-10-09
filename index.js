import forgotPasswordRouter from "./routes/auth-forgot-password.js";
import resetPasswordRouter from "./routes/auth-reset-password.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import passport from "./config/passport.js";
import authRoutes from "./routes/auth_clean.js";
import formRoutes from "./routes/forms.js";
import uploadRoutes from "./routes/upload.js";
import planRoutes from "./routes/plans.js";
import questionnaireRoutes from "./routes/questionnaires.js";
import adminRoutes from "./routes/admin-working.js";
import paymentRoutes from "./routes/payment.js";
import emailTestRoutes from "./routes/email-test.js";
import settingsRoutes from "./routes/settings.js";
import paymentSettingsRoutes from "./routes/paymentSettings.js";
import stripeRoutes from "./routes/stripe.js";
import dashboardRoutes from "./routes/dashboard.js";
import responsesRoutes from "./routes/responses.js";
import questionnaireAccessRoutes from "./routes/questionnaire-access.js";
import appSettingsRoutes from "./routes/appSettings.js";
import promptTemplatesRoutes from "./routes/prompt-templates.js";
import aiIntegrationRoutes from "./routes/ai-integration.js";
import reportsRoutes from "./routes/reports.js";
import usersRoutes from "./routes/users.js";
import pageData from "./routes/pages.js";
import imageUpload from "./routes/imageUpload.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// Register the password reset routes after app is initialized and middleware is set up
app.use("/api/auth", forgotPasswordRouter);
app.use("/api/auth", resetPasswordRouter);

// Use the routes from routes/pages.js
app.use("/api/pages", pageData);
// Serve static files from the public directory
app.use(express.static("public"));

// Initialize passport
app.use(passport.initialize());

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Serve public files (logos, favicons) statically
app.use(express.static(path.join(__dirname, "../public")));

// Special handling for favicon.ico with no-cache headers
app.get("/favicon.ico", (req, res) => {
  const faviconPath = path.join(__dirname, "../public/favicon.ico");

  // Set headers to prevent aggressive caching
  res.set({
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Content-Type": "image/x-icon",
  });

  if (fs.existsSync(faviconPath)) {
    res.sendFile(faviconPath);
  } else {
    res.status(404).send("Favicon not found");
  }
});

// Image upload route for page Editor
app.use("/api/upload", imageUpload);

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/forms", formRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/questionnaires", questionnaireRoutes);
app.use("/api/payment", paymentRoutes);

app.use("/api/settings", settingsRoutes);
app.use("/api/payment-settings", paymentSettingsRoutes);
app.use("/api/email", emailTestRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", responsesRoutes);
app.use("/api", questionnaireAccessRoutes);
app.use("/api", appSettingsRoutes);
app.use("/api/prompt-templates", promptTemplatesRoutes);
app.use("/api/ai", aiIntegrationRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/users", usersRoutes);

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../index.html"));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log("Prompt templates API added");
});

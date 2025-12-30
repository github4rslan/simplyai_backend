import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const getEnv = (key, defaultValue) =>
  process.env[key] !== undefined ? process.env[key] : defaultValue;

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined) return defaultValue;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
};

const parseNumber = (value, defaultValue) =>
  value !== undefined && value !== null && value !== ""
    ? Number(value)
    : defaultValue;

const parseList = (value, delimiter = ",") =>
  value
    ? value
        .split(delimiter)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const PORT = parseNumber(getEnv("PORT", "4000"), 4000);
const FRONTEND_URL = getEnv("FRONTEND_URL", "https://simplyai.it");
const ADMIN_URL = getEnv("ADMIN_URL", "https://admin.simplyai.it");
const BACKEND_URL = getEnv("BACKEND_URL", `http://localhost:${PORT}`);

const DEFAULT_API_BASE_URL = `${BACKEND_URL.replace(/\/$/, "")}/api`;
const API_BASE_URL = getEnv("API_BASE_URL", DEFAULT_API_BASE_URL);

const corsOrigins = new Set([
  ...parseList(getEnv("CORS_ORIGINS")),
  FRONTEND_URL,
  ADMIN_URL,
  BACKEND_URL,
  API_BASE_URL,
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:5173",
  "http://localhost:4000",
  "https://simplyai.it",
  "https://www.simplyai.it",
  "https://api.simplyai.it",
]);

export const appConfig = {
  env: {
    mode: getEnv("NODE_ENV", "development"),
    isProduction: getEnv("NODE_ENV", "development") === "production",
    isDevelopment: getEnv("NODE_ENV", "development") !== "production",
  },
  server: {
    port: PORT,
    frontendUrl: FRONTEND_URL,
    adminUrl: ADMIN_URL,
    backendUrl: BACKEND_URL,
    apiBaseUrl: API_BASE_URL,
  },
  cors: {
    allowedOrigins: Array.from(corsOrigins).filter(Boolean),
    allowSubdomains: parseBoolean(getEnv("CORS_ALLOW_SUBDOMAINS", "true"), true),
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
    allowedMethods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  },
  database: {
    host: getEnv("DB_HOST", "localhost"),
    port: parseNumber(getEnv("DB_PORT", "3306"), 3306),
    name: getEnv("DB_NAME", "simplyai"),
    user: getEnv("DB_USER", "simplyai"),
    password: getEnv("DB_PASSWORD", ""),
    connectionLimit: parseNumber(getEnv("DB_POOL_SIZE", "10"), 10),
  },
  security: {
    jwtSecret: getEnv("JWT_SECRET", "change-me-in-production"),
  },
  oauth: {
    google: {
      clientId: getEnv("GOOGLE_CLIENT_ID"),
      clientSecret: getEnv("GOOGLE_CLIENT_SECRET"),
    },
    facebook: {
      appId: getEnv("FACEBOOK_APP_ID"),
      appSecret: getEnv("FACEBOOK_APP_SECRET"),
    },
  },
  email: {
    gmail: {
      address: getEnv("GMAIL_EMAIL"),
      appPassword: getEnv("GMAIL_APP_PASSWORD"),
    },
    brevo: {
      address: getEnv("BREVO_EMAIL"),
      apiKey: getEnv("BREVO_API_KEY"),
    },
  },
  stripe: {
    secretKey: getEnv("STRIPE_SECRET_KEY"),
    publishableKey: getEnv("STRIPE_PUBLISHABLE_KEY"),
  },
  thirdParty: {
    openAiKey: getEnv("OPENAI_API_KEY"),
  },
};

export const getAppConfig = () => appConfig;


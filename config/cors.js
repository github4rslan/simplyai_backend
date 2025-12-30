import { appConfig } from "./app.js";

const ALLOWED_ORIGINS = appConfig.cors.allowedOrigins.map((origin) =>
  origin.trim()
);
const ALLOW_SUBDOMAINS = appConfig.cors.allowSubdomains;

const isOriginAllowed = (origin) => {
  if (!origin) return true; // Allow non-browser clients (e.g., curl, server-to-server)

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    const matchesSubdomain =
      ALLOW_SUBDOMAINS &&
      ALLOWED_ORIGINS.some((allowedOrigin) => {
        try {
          const allowedHostname = new URL(allowedOrigin).hostname;
          return (
            hostname === allowedHostname ||
            hostname.endsWith(`.${allowedHostname}`)
          );
        } catch {
          return false;
        }
      });

    return ALLOWED_ORIGINS.includes(origin) || matchesSubdomain;
  } catch {
    return ALLOWED_ORIGINS.includes(origin);
  }
};

export const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
    }
  },
  credentials: true,
  methods: appConfig.cors.allowedMethods,
  allowedHeaders: appConfig.cors.allowedHeaders,
  exposedHeaders: ["Content-Length", "X-Requested-With"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

export const allowedOrigins = ALLOWED_ORIGINS;


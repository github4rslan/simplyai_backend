import mysql from "mysql2/promise";
import { appConfig } from "./config/app.js";

const {
  host,
  user,
  password,
  name,
  port,
  connectionLimit,
} = appConfig.database;

if (process.env.NODE_ENV !== "production") {
  console.log("DB configuration:");
  console.log("- DB_HOST:", host);
  console.log("- DB_USER:", user);
  console.log("- DB_PASSWORD:", password ? "[SET]" : "[NOT SET]");
  console.log("- DB_NAME:", name);
  console.log("- DB_PORT:", port);
}

export const pool = mysql.createPool({
  host,
  user,
  password,
  database: name,
  port,
  waitForConnections: true,
  connectionLimit,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Gracefully close the pool when the process is shutting down
const shutdownPool = async (signal) => {
  console.log(`${signal} received — closing database pool…`);
  try {
    await pool.end();
    console.log("Database pool closed.");
  } catch (err) {
    console.error("Error closing database pool:", err.message);
  }
  process.exit(0);
};

process.on("SIGTERM", () => shutdownPool("SIGTERM"));
process.on("SIGINT", () => shutdownPool("SIGINT"));

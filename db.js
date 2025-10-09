import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from the backend directory
dotenv.config({ path: join(__dirname, ".env") });

console.log("🔧 Database configuration:");
console.log("- DB_HOST:", process.env.DB_HOST);
console.log("- DB_USER:", process.env.DB_USER);
console.log("- DB_PASSWORD:", process.env.DB_PASSWORD ? "[SET]" : "[NOT SET]");
console.log("- DB_NAME:", process.env.DB_NAME);
console.log("- DB_PORT:", process.env.DB_PORT);

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

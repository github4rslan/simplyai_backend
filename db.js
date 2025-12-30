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

console.log("🔧 Database configuration:");
console.log("- DB_HOST:", host);
console.log("- DB_USER:", user);
console.log("- DB_PASSWORD:", password ? "[SET]" : "[NOT SET]");
console.log("- DB_NAME:", name);
console.log("- DB_PORT:", port);

export const pool = mysql.createPool({
  host,
  user,
  password,
  database: name,
  port,
  waitForConnections: true,
  connectionLimit,
  queueLimit: 0,
});

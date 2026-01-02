import knex from "knex";
import { appConfig } from "./app.js";

const dbConfig = appConfig.database;

export const db = knex({
  client: "mysql2",
  connection: {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.name,
  },
  pool: {
    min: 2,
    max: dbConfig.connectionLimit || 10,
  },
});

// Test connection
if (process.env.NODE_ENV !== "production") {
  db.raw("SELECT 1")
    .then(() => {
      console.log("Knex database connection established");
    })
    .catch((err) => {
      console.error("Knex database connection failed:", err.message);
    });
}

export default db;

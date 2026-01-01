import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

/**
 * Migration to add notification-related columns to app_settings
 * Adds: send_welcome_email, send_completion_email, send_email_in_report, send_admin_notification
 */
async function addNotificationSettingsColumns() {
  const columnsToAdd = [
    { name: "send_welcome_email", definition: "BOOLEAN DEFAULT TRUE" },
    { name: "send_completion_email", definition: "BOOLEAN DEFAULT TRUE" },
    { name: "send_email_in_report", definition: "BOOLEAN DEFAULT TRUE" },
    { name: "send_admin_notification", definition: "BOOLEAN DEFAULT TRUE" },
  ];

  let connection;
  try {
    console.log("Starting notification settings migration...");
    connection = await pool.getConnection();

    // Discover existing columns
    const [describeRows] = await connection.execute("DESCRIBE app_settings");
    const existingColumns = describeRows.map((col) => col.Field);
    console.log("Existing app_settings columns:", existingColumns);

    // Add missing columns
    for (const column of columnsToAdd) {
      if (!existingColumns.includes(column.name)) {
        console.log(`Adding column: ${column.name}`);
        await connection.execute(
          `ALTER TABLE app_settings ADD COLUMN ${column.name} ${column.definition}`
        );
        console.log(`Added column: ${column.name}`);
      } else {
        console.log(`Column ${column.name} already exists, skipping`);
      }
    }

    // Backfill defaults for existing rows
    console.log("Backfilling notification flags with defaults where NULL...");
    await connection.execute(`
      UPDATE app_settings
      SET
        send_welcome_email = COALESCE(send_welcome_email, TRUE),
        send_completion_email = COALESCE(send_completion_email, TRUE),
        send_email_in_report = COALESCE(send_email_in_report, TRUE),
        send_admin_notification = COALESCE(send_admin_notification, TRUE)
    `);
    console.log("Backfill completed.");

    // Log final structure for verification
    const [finalColumns] = await connection.execute("DESCRIBE app_settings");
    console.log("Final app_settings columns:");
    finalColumns
      .filter((col) => col.Field.startsWith("send_"))
      .forEach((col) => {
        console.log(
          `  ${col.Field}: ${col.Type} ${col.Null === "NO" ? "(NOT NULL)" : "(NULLABLE)"} Default: ${
            col.Default === null ? "NULL" : col.Default
          }`
        );
      });

    console.log("Notification settings migration completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Run directly (Windows-safe path check)
const isDirectRun = (() => {
  const thisFile = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return path.resolve(thisFile) === invoked;
})();

if (isDirectRun) {
  addNotificationSettingsColumns()
    .then(() => {
      console.log("Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration script failed:", error);
      process.exit(1);
    });
}

export { addNotificationSettingsColumns };

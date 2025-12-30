import express from "express";
import { pool } from "../db.js";
import { appConfig } from "../config/app.js";

const router = express.Router();

router.get("/live", (req, res) => {
  res.success("Service is responding", {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: appConfig.env.mode,
  });
});

router.get("/ready", async (req, res) => {
  const start = process.hrtime.bigint();
  try {
    await pool.query("SELECT 1");
    const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
    res.success("All dependencies healthy", {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: "connected",
        latencyMs: Number(duration.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("❌ Health check failed:", error.message);
    res.fail(503, "Dependency check failed", {
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

export default router;


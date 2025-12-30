import express from "express";
import { db } from "../config/knex.js";

const router = express.Router();

// GET /api/settings
router.get("/", async (req, res) => {
  try {
    const rows = await db("app_settings")
      .orderBy("created_at", "desc")
      .limit(1);
    if (rows.length === 0) {
      console.log("⚠️ No app settings found in database");
      return res.fail(404, "App settings not found");
    }

    console.log("📖 LOADING notification settings from database:");
    console.log("  Welcome Email:", rows[0].send_welcome_email);
    console.log("  Completion Email:", rows[0].send_completion_email);
    console.log("  Email in Report:", rows[0].send_email_in_report);
    console.log("  Admin Notification:", rows[0].send_admin_notification);

    return res.success("App settings fetched", rows[0]);
  } catch (error) {
    console.error("Error fetching app settings:", error);
    return res.fail(500, "Failed to fetch app settings", error.message);
  }
});

// get 3 main colors
router.get("/colorProfiles", async (req, res) => {
  try {
    const rows = await db("app_settings")
      .select("primary_color", "secondary_color", "accent_color")
      .orderBy("created_at", "desc")
      .limit(1);
    if (rows.length === 0) {
      console.log("⚠️ No app settings found in database");
      return res.fail(404, "App settings not found");
    }

    console.log("📖 LOADING color profile settings from database:");
    console.log("  Primary Color:", rows[0].primary_color);
    console.log("  Secondary Color:", rows[0].secondary_color);
    console.log("  Accent Color:", rows[0].accent_color);

    return res.success("Color profiles fetched", rows[0]);
  } catch (error) {
    console.error("Error fetching app settings:", error);
    return res.fail(500, "Failed to fetch app settings", error.message);
  }
});

// PUT /api/settings
router.put("/", async (req, res) => {
  try {
    const {
      site_name,
      site_description,
      contact_email,
      site_url,
      logo,
      favicon,
      primary_color,
      secondary_color,
      accent_color,
      font_family,
      font_size,
      button_style,
      enable_registration,
      require_email_verification,
      max_storage_per_user,
      // Notification settings
      send_welcome_email,
      send_completion_email,
      send_email_in_report,
      send_admin_notification,
      // Payment settings
      enable_payments,
      currency,
      vat_percentage,
      stripe_public_key,
      stripe_secret_key,
    } = req.body;

    console.log("📧 NOTIFICATION SETTINGS RECEIVED:");
    console.log("  Welcome Email:", send_welcome_email);
    console.log("  Completion Email:", send_completion_email);
    console.log("  Email in Report:", send_email_in_report);
    console.log("  Admin Notification:", send_admin_notification);

    console.log("💳 PAYMENT SETTINGS RECEIVED:");
    console.log("  Enable Payments:", enable_payments);
    console.log("  Currency:", currency);
    console.log("  VAT Percentage:", vat_percentage);
    console.log(
      "  Stripe Public Key:",
      stripe_public_key ? "Present" : "Not provided"
    );
    console.log(
      "  Stripe Secret Key:",
      stripe_secret_key ? "Present" : "Not provided"
    );

    const existing = await db("app_settings").select("id").limit(1).first();
    if (existing) {
      console.log("✏️ UPDATING existing settings in database...");
      const affectedRows = await db("app_settings")
        .where("id", existing.id)
        .update({
          site_name,
          site_description,
          contact_email,
          site_url,
          logo,
          favicon,
          primary_color,
          secondary_color,
          accent_color,
          font_family,
          font_size,
          button_style,
          enable_registration,
          require_email_verification,
          max_storage_per_user,
          send_welcome_email,
          send_completion_email,
          send_email_in_report,
          send_admin_notification,
          enable_payments,
          currency,
          vat_percentage,
          stripe_public_key,
          stripe_secret_key,
          updated_at: db.fn.now(),
        });
      console.log("✅ UPDATE completed. Affected rows:", affectedRows);
    } else {
      console.log("➕ INSERTING new settings in database...");
      await db("app_settings").insert({
        site_name,
        site_description,
        contact_email,
        site_url,
        logo,
        favicon,
        primary_color,
        secondary_color,
        accent_color,
        font_family,
        font_size,
        button_style,
        enable_registration,
        require_email_verification,
        max_storage_per_user,
        send_welcome_email,
        send_completion_email,
        send_email_in_report,
        send_admin_notification,
        enable_payments,
        currency,
        vat_percentage,
        stripe_public_key,
        stripe_secret_key,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
      console.log("✅ INSERT completed.");
    }

    // Verify the notification settings were saved
    const verification = await db("app_settings")
      .select(
        "send_welcome_email",
        "send_completion_email",
        "send_email_in_report",
        "send_admin_notification",
        "currency",
        "enable_payments"
      )
      .orderBy("created_at", "desc")
      .limit(1)
      .first();

    if (verification) {
      console.log("🔍 VERIFICATION - Current settings in database:");
      console.log("  Welcome Email:", verification.send_welcome_email);
      console.log("  Completion Email:", verification.send_completion_email);
      console.log("  Email in Report:", verification.send_email_in_report);
      console.log(
        "  Admin Notification:",
        verification.send_admin_notification
      );
      console.log("  Currency:", verification.currency);
      console.log("  Enable Payments:", verification.enable_payments);
    }

    return res.success("App settings updated successfully");
  } catch (error) {
    console.error("Error updating app settings:", error);
    return res.fail(500, "Failed to update app settings", error.message);
  }
});

export default router;

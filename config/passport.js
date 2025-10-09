import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { pool } from "../db.js";

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "your_google_client_id",
      clientSecret:
        process.env.GOOGLE_CLIENT_SECRET || "your_google_client_secret",
      callbackURL: `${
        process.env.BACKEND_URL || "http://localhost:4000"
      }/api/auth/google/callback`,
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const firstName = profile.name?.givenName || "";
        const lastName = profile.name?.familyName || "";
        const googleId = profile.id;

        if (!email) {
          return done(new Error("No email found in Google profile"), null);
        }

        console.log("🔍 Google OAuth - Email:", email, "GoogleId:", googleId);

        // Check if user exists by google_id first (most reliable)
        let [existingUsers] = await pool.execute(
          "SELECT * FROM profiles WHERE google_id = ?",
          [googleId]
        );

        // If not found by google_id, check by email
        if (existingUsers.length === 0) {
          [existingUsers] = await pool.execute(
            "SELECT * FROM profiles WHERE email = ?",
            [email]
          );
        }

        console.log("🔍 Existing users found:", existingUsers.length);

        if (existingUsers.length > 0) {
          const user = existingUsers[0];
          console.log("✅ Existing user found:", user.email);

          // Update google_id and auth_provider if not set
          if (!user.google_id) {
            console.log("🔄 Linking Google account to existing user");
            await pool.execute(
              `UPDATE profiles 
               SET google_id = ?, 
                   auth_provider = CASE 
                     WHEN auth_provider = 'email' THEN 'google' 
                     ELSE auth_provider 
                   END,
                   email_verified = TRUE
               WHERE id = ?`,
              [googleId, user.id]
            );
            user.google_id = googleId;
          }

          // Update last activity
          await pool.execute(
            "UPDATE profiles SET last_activity = NOW() WHERE id = ?",
            [user.id]
          );

          user.isNewUser = false;
          console.log("🔄 Returning existing user");
          return done(null, user);
        }

        // New user - return profile data for registration
        console.log("🆕 New Google user detected:", email);
        const newUserData = {
          isNewUser: true,
          googleProfile: {
            email,
            firstName,
            lastName,
            googleId,
          },
        };

        console.log("🔄 Returning new user data for pricing page");
        return done(null, newUserData);
      } catch (error) {
        console.error("❌ Google OAuth error:", error);
        return done(error, null);
      }
    }
  )
);

// Facebook OAuth Strategy
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID || "your_facebook_app_id",
      clientSecret:
        process.env.FACEBOOK_APP_SECRET || "your_facebook_app_secret",
      callbackURL: `${
        process.env.BACKEND_URL || "http://localhost:4000"
      }/api/auth/facebook/callback`,
      profileFields: ["id", "emails", "name"],
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const firstName = profile.name?.givenName || "";
        const lastName = profile.name?.familyName || "";
        const facebookId = profile.id;

        if (!email) {
          return done(new Error("No email found in Facebook profile"), null);
        }

        console.log(
          "🔍 Facebook OAuth - Email:",
          email,
          "FacebookId:",
          facebookId
        );

        // Check if user exists by facebook_id first
        let [existingUsers] = await pool.execute(
          "SELECT * FROM profiles WHERE facebook_id = ?",
          [facebookId]
        );

        // If not found by facebook_id, check by email
        if (existingUsers.length === 0) {
          [existingUsers] = await pool.execute(
            "SELECT * FROM profiles WHERE email = ?",
            [email]
          );
        }

        console.log("🔍 Existing users found:", existingUsers.length);

        if (existingUsers.length > 0) {
          const user = existingUsers[0];
          console.log("✅ Existing user found:", user.email);

          // Update facebook_id and auth_provider if not set
          if (!user.facebook_id) {
            console.log("🔄 Linking Facebook account to existing user");
            await pool.execute(
              `UPDATE profiles 
               SET facebook_id = ?, 
                   auth_provider = CASE 
                     WHEN auth_provider = 'email' THEN 'facebook' 
                     ELSE auth_provider 
                   END,
                   email_verified = TRUE
               WHERE id = ?`,
              [facebookId, user.id]
            );
            user.facebook_id = facebookId;
          }

          // Update last activity
          await pool.execute(
            "UPDATE profiles SET last_activity = NOW() WHERE id = ?",
            [user.id]
          );

          user.isNewUser = false;
          console.log("🔄 Returning existing user");
          return done(null, user);
        }

        // New user - return profile data for registration
        console.log("🆕 New Facebook user detected:", email);
        const newUserData = {
          isNewUser: true,
          facebookProfile: {
            email,
            firstName,
            lastName,
            facebookId,
          },
        };

        console.log("🔄 Returning new user data for pricing page");
        return done(null, newUserData);
      } catch (error) {
        console.error("❌ Facebook OAuth error:", error);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (userId, done) => {
  try {
    const [users] = await pool.execute("SELECT * FROM profiles WHERE id = ?", [
      userId,
    ]);
    done(null, users[0]);
  } catch (error) {
    done(error, null);
  }
});

export default passport;

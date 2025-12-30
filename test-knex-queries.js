/**
 * Test script to verify Knex queries work correctly with the database
 * Run this before deploying to ensure no SQL compatibility issues
 */
import { db } from "./config/knex.js";
import { pool } from "./db.js";

const testQueries = async () => {
  console.log("🧪 Testing Knex queries against database...\n");

  const tests = [];
  let passed = 0;
  let failed = 0;

  // Test 1: Basic count query
  try {
    const knexResult = await db("profiles").count("* as count").first();
    const rawResult = await pool.query("SELECT COUNT(*) as count FROM profiles");
    const knexCount = knexResult.count;
    const rawCount = rawResult[0][0].count;

    if (knexCount === rawCount) {
      tests.push({ name: "Count profiles", status: "✅ PASS", knex: knexCount, raw: rawCount });
      passed++;
    } else {
      tests.push({ name: "Count profiles", status: "❌ FAIL", knex: knexCount, raw: rawCount });
      failed++;
    }
  } catch (error) {
    tests.push({ name: "Count profiles", status: "❌ ERROR", error: error.message });
    failed++;
  }

  // Test 2: Select with where
  try {
    const knexResult = await db("subscription_plans").where("active", 1).limit(1).first();
    const rawResult = await pool.query("SELECT * FROM subscription_plans WHERE active = 1 LIMIT 1");
    
    if (knexResult && rawResult[0][0]) {
      const knexId = knexResult.id;
      const rawId = rawResult[0][0].id;
      if (knexId === rawId) {
        tests.push({ name: "Select with where", status: "✅ PASS" });
        passed++;
      } else {
        tests.push({ name: "Select with where", status: "❌ FAIL - IDs don't match" });
        failed++;
      }
    } else {
      tests.push({ name: "Select with where", status: "⚠️ SKIP - No data" });
    }
  } catch (error) {
    tests.push({ name: "Select with where", status: "❌ ERROR", error: error.message });
    failed++;
  }

  // Test 3: Join query
  try {
    const knexResult = await db("questionnaire_responses as qr")
      .select("qr.id", "p.email")
      .leftJoin("profiles as p", "qr.user_id", "p.id")
      .limit(1)
      .first();
    
    const rawResult = await pool.query(`
      SELECT qr.id, p.email 
      FROM questionnaire_responses qr 
      LEFT JOIN profiles p ON qr.user_id = p.id 
      LIMIT 1
    `);

    if (knexResult && rawResult[0][0]) {
      tests.push({ name: "Left join query", status: "✅ PASS" });
      passed++;
    } else {
      tests.push({ name: "Left join query", status: "⚠️ SKIP - No data" });
    }
  } catch (error) {
    tests.push({ name: "Left join query", status: "❌ ERROR", error: error.message });
    failed++;
  }

  // Test 4: Insert (if we have test data)
  try {
    const testId = `test-${Date.now()}`;
    await db("subscription_plans").insert({
      id: testId,
      name: "Test Plan",
      price: 0,
      active: 0,
      is_free: 1,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const inserted = await db("subscription_plans").where("id", testId).first();
    
    if (inserted) {
      await db("subscription_plans").where("id", testId).delete();
      tests.push({ name: "Insert and delete", status: "✅ PASS" });
      passed++;
    } else {
      tests.push({ name: "Insert and delete", status: "❌ FAIL" });
      failed++;
    }
  } catch (error) {
    tests.push({ name: "Insert and delete", status: "❌ ERROR", error: error.message });
    failed++;
  }

  // Test 5: Update
  try {
    const testId = `test-update-${Date.now()}`;
    await db("subscription_plans").insert({
      id: testId,
      name: "Test Plan",
      price: 0,
      active: 0,
      is_free: 1,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await db("subscription_plans").where("id", testId).update({ name: "Updated Plan" });
    const updated = await db("subscription_plans").where("id", testId).first();
    
    if (updated && updated.name === "Updated Plan") {
      await db("subscription_plans").where("id", testId).delete();
      tests.push({ name: "Update query", status: "✅ PASS" });
      passed++;
    } else {
      await db("subscription_plans").where("id", testId).delete();
      tests.push({ name: "Update query", status: "❌ FAIL" });
      failed++;
    }
  } catch (error) {
    tests.push({ name: "Update query", status: "❌ ERROR", error: error.message });
    failed++;
  }

  // Test 6: Order by and limit
  try {
    const knexResult = await db("profiles")
      .select("id", "email")
      .orderBy("created_at", "desc")
      .limit(5);
    
    const rawResult = await pool.query(`
      SELECT id, email FROM profiles ORDER BY created_at DESC LIMIT 5
    `);

    if (knexResult.length === rawResult[0].length) {
      tests.push({ name: "Order by and limit", status: "✅ PASS" });
      passed++;
    } else {
      tests.push({ name: "Order by and limit", status: "❌ FAIL - Count mismatch" });
      failed++;
    }
  } catch (error) {
    tests.push({ name: "Order by and limit", status: "❌ ERROR", error: error.message });
    failed++;
  }

  // Print results
  console.log("📊 Test Results:\n");
  tests.forEach((test) => {
    console.log(`${test.status} ${test.name}`);
    if (test.error) {
      console.log(`   Error: ${test.error}`);
    }
    if (test.knex !== undefined) {
      console.log(`   Knex: ${test.knex}, Raw: ${test.raw}`);
    }
  });

  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${tests.length}\n`);

  if (failed === 0) {
    console.log("🎉 All tests passed! Knex is compatible with your database.");
    process.exit(0);
  } else {
    console.log("⚠️ Some tests failed. Please review the errors above.");
    process.exit(1);
  }
};

// Run tests
testQueries().catch((error) => {
  console.error("💥 Fatal error running tests:", error);
  process.exit(1);
});


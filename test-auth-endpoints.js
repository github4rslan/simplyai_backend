// Test file for authentication endpoints
// Run with: node test-auth-endpoints.js

import fetch from "node-fetch";

const BASE_URL = "http://localhost:3000/api/auth"; // Adjust port as needed

// Test data
const testUser = {
  email: "test@example.com",
  password: "testpass123",
  firstName: "John",
  lastName: "Doe",
  phone: "+1234567890",
  address: "123 Test Street",
  fiscalCode: "TEST123456",
};

let authToken = "";

// Helper function to make requests
async function makeRequest(
  endpoint,
  method = "GET",
  body = null,
  token = null
) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();

    return {
      status: response.status,
      data,
    };
  } catch (error) {
    console.error(`Error making request to ${endpoint}:`, error.message);
    return {
      status: 500,
      data: { error: error.message },
    };
  }
}

// Test functions
async function testRegister() {
  console.log("\n=== Testing User Registration ===");

  const result = await makeRequest("/register", "POST", testUser);

  console.log("Status:", result.status);
  console.log("Response:", JSON.stringify(result.data, null, 2));

  if (result.status === 201 && result.data.success) {
    authToken = result.data.data.token;
    console.log("✅ Registration successful");
    return true;
  } else {
    console.log("❌ Registration failed");
    return false;
  }
}

async function testLogin() {
  console.log("\n=== Testing User Login ===");

  const loginData = {
    email: testUser.email,
    password: testUser.password,
  };

  const result = await makeRequest("/login", "POST", loginData);

  console.log("Status:", result.status);
  console.log("Response:", JSON.stringify(result.data, null, 2));

  if (result.status === 200 && result.data.success) {
    authToken = result.data.data.token;
    console.log("✅ Login successful");
    return true;
  } else {
    console.log("❌ Login failed");
    return false;
  }
}

async function testGetCurrentUser() {
  console.log("\n=== Testing Get Current User ===");

  const result = await makeRequest("/me", "GET", null, authToken);

  console.log("Status:", result.status);
  console.log("Response:", JSON.stringify(result.data, null, 2));

  if (result.status === 200 && result.data.success) {
    console.log("✅ Get current user successful");
    return true;
  } else {
    console.log("❌ Get current user failed");
    return false;
  }
}

async function testGetAllUsers() {
  console.log("\n=== Testing Get All Users (Admin Required) ===");

  const result = await makeRequest("/users", "GET", null, authToken);

  console.log("Status:", result.status);
  console.log("Response:", JSON.stringify(result.data, null, 2));

  if (result.status === 200 || result.status === 403) {
    console.log("✅ Get all users endpoint working (may require admin role)");
    return true;
  } else {
    console.log("❌ Get all users failed");
    return false;
  }
}

async function testLogout() {
  console.log("\n=== Testing User Logout ===");

  const result = await makeRequest("/logout", "POST", null, authToken);

  console.log("Status:", result.status);
  console.log("Response:", JSON.stringify(result.data, null, 2));

  if (result.status === 200 && result.data.success) {
    console.log("✅ Logout successful");
    return true;
  } else {
    console.log("❌ Logout failed");
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log("🚀 Starting Authentication Endpoint Tests");
  console.log("Base URL:", BASE_URL);

  const tests = [
    { name: "Register", fn: testRegister },
    { name: "Login", fn: testLogin },
    { name: "Get Current User", fn: testGetCurrentUser },
    { name: "Get All Users", fn: testGetAllUsers },
    { name: "Logout", fn: testLogout },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const success = await test.fn();
      if (success) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ Test ${test.name} threw an error:`, error.message);
      failed++;
    }
  }

  console.log("\n=== Test Results ===");
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);

  if (failed === 0) {
    console.log("🎉 All tests passed!");
  } else {
    console.log(
      "⚠️  Some tests failed. Check the server and database connection."
    );
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export {
  testRegister,
  testLogin,
  testGetCurrentUser,
  testGetAllUsers,
  testLogout,
  runTests,
};

// Simple test for forgot password endpoint
import fetch from "node-fetch";

async function testForgotPassword() {
  try {
    console.log("Testing forgot password endpoint...");

    const response = await fetch(
      "http://localhost:4000/api/auth/forgot-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "test@example.com",
        }),
      }
    );

    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Response:", data);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testForgotPassword();

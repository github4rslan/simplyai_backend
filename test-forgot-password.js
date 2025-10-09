// Test the forgot password endpoint
const testEmail = "test@example.com";

fetch("http://localhost:4000/api/auth/forgot-password", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: testEmail,
  }),
})
  .then((response) => response.json())
  .then((data) => {
    console.log("Response:", data);
  })
  .catch((error) => {
    console.error("Error:", error);
  });

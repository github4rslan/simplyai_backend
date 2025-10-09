import express from "express";
import { pool } from "../db.js";

const app = express.Router();

app.post("/:id", async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  await pool.query(
    "INSERT INTO pages (id, title, content) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content)",
    [id, title, content]
  );

  res.json({ success: true });
});

// Fetch page content
app.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query("SELECT * FROM pages WHERE id = ?", [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Page not found" });
    }

    console.log(rows[0]);

    res.json({ data: rows[0] }); // wrap in {data: ...} so frontend works
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update page content
app.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    console.log("Title of the Page:", title);
    console.log("Content of the Page:", content);
    console.log("ID:", id);

    // Check if page exists
    const [existing] = await pool.query("SELECT id FROM pages WHERE id = ?", [
      id,
    ]);
    console.log("Existing rows found:", existing.length);

    if (existing.length > 0) {
      // Update existing page
      console.log("Updating existing page with ID:", id);
      const [result] = await pool.query(
        "UPDATE pages SET title = ?, content = ? WHERE id = ?",
        [title, content, id]
      );
      console.log("Update result:", result);
      console.log("Rows affected:", result.affectedRows);

      if (result.affectedRows === 0) {
        console.error("WARNING: UPDATE executed but no rows were affected!");
      }
    } else {
      // Insert new page
      console.log("Inserting new page with ID:", id);
      const [result] = await pool.query(
        "INSERT INTO pages (id, title, content) VALUES (?, ?, ?)",
        [id, title, content]
      );
      console.log("Insert result:", result);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default app;

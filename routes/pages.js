import express from "express";
import { pool } from "../db.js";

const app = express.Router();

app.post("/:id", async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  try {
    // Normalize content: if blank, store NULL so frontend can fallback
    const isBlank =
      content === null ||
      content === undefined ||
      (typeof content === "string" && content.trim() === "");
    const contentJson = isBlank
      ? null
      : JSON.stringify(typeof content === "string" ? content : content);
    const slug = id; // Use id as slug if not provided

    await pool.query(
      "INSERT INTO pages (id, title, slug, content) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content)",
      [id, title, slug, contentJson]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error creating/updating page:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch page content
app.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query("SELECT * FROM pages WHERE id = ?", [id]);

    if (rows.length === 0) {
      // Return empty content instead of 404 to allow frontend to use fallback
      return res.json({ 
        data: { 
          id, 
          title: id.charAt(0).toUpperCase() + id.slice(1), 
          content: "" 
        } 
      });
    }

    const page = rows[0];
    
    // Handle JSON content field - parse if it's a JSON string
    if (page.content && typeof page.content === 'string') {
      try {
        page.content = JSON.parse(page.content);
      } catch (e) {
        // If parsing fails, keep as string
      }
    }

    // If content is missing/blank, let frontend fallback render
    if (
      !page.content ||
      (typeof page.content === "string" && page.content.trim() === "")
    ) {
      return res.json({ 
        data: { 
          id, 
          title: page.title || id.charAt(0).toUpperCase() + id.slice(1), 
          content: "" 
        } 
      });
    }

    console.log("Page fetched:", page.id);

    res.json({ data: page }); // wrap in {data: ...} so frontend works
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
      // Normalize content: if blank, store NULL so frontend can fallback
      const isBlank =
        content === null ||
        content === undefined ||
        (typeof content === "string" && content.trim() === "");
      const contentJson = isBlank
        ? null
        : JSON.stringify(typeof content === "string" ? content : content);
      const [result] = await pool.query(
        "UPDATE pages SET title = ?, content = ? WHERE id = ?",
        [title, contentJson, id]
      );
      console.log("Update result:", result);
      console.log("Rows affected:", result.affectedRows);

      if (result.affectedRows === 0) {
        console.error("WARNING: UPDATE executed but no rows were affected!");
      }
    } else {
      // Insert new page
      console.log("Inserting new page with ID:", id);
      // Normalize content: if blank, store NULL so frontend can fallback
      const isBlank =
        content === null ||
        content === undefined ||
        (typeof content === "string" && content.trim() === "");
      const contentJson = isBlank
        ? null
        : JSON.stringify(typeof content === "string" ? content : content);
      const slug = id; // Use id as slug if not provided
      const [result] = await pool.query(
        "INSERT INTO pages (id, title, slug, content) VALUES (?, ?, ?, ?)",
        [id, title, slug, contentJson]
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

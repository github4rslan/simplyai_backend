import { pool } from "./db.js";
import dotenv from "dotenv";

dotenv.config();

const defaultPages = [
  {
    id: "home",
    title: "Home",
    slug: "home",
    content: "",
  },
  {
    id: "about",
    title: "Chi Siamo",
    slug: "about",
    content: "",
  },
  {
    id: "contact",
    title: "Contatti",
    slug: "contact",
    content: "",
  },
  {
    id: "guide",
    title: "Guida",
    slug: "guide",
    content: "",
  },
  {
    id: "pricing",
    title: "Prezzi",
    slug: "pricing",
    content: "",
  },
];

async function initDefaultPages() {
  try {
    console.log("🔄 Initializing default pages...");

    for (const page of defaultPages) {
      try {
        // Check if page exists
        const [existing] = await pool.query(
          "SELECT id FROM pages WHERE id = ?",
          [page.id]
        );

        if (existing.length === 0) {
          // Insert new page - convert content to JSON string
          const contentJson = JSON.stringify(page.content);
          await pool.query(
            "INSERT INTO pages (id, title, slug, content) VALUES (?, ?, ?, ?)",
            [page.id, page.title, page.slug, contentJson]
          );
          console.log(`✅ Created page: ${page.id} (${page.title})`);
        } else {
          console.log(`⏭️  Page already exists: ${page.id}`);
        }
      } catch (error) {
        console.error(`❌ Error creating page ${page.id}:`, error.message);
      }
    }

    console.log("🎉 Default pages initialization complete!");
  } catch (error) {
    console.error("❌ Failed to initialize default pages:", error.message);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

initDefaultPages();


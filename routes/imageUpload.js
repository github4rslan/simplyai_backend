// server.js
import express from "express";
import multer from "multer";
import path from "path";

const app = express.Router();

// configure storage to public/uploads
const storage = multer.diskStorage({
  destination: "public/uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // unique filename
  },
});
const upload = multer({ storage });

app.post("/", upload.single("image"), (req, res) => {
  const fileUrl = `/uploads/${req.file.filename}`;
  console.log("Uploaded file URL:", fileUrl);
  res.json({ url: fileUrl });
});

export default app;

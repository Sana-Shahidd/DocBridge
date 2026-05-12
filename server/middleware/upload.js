// ─────────────────────────────────────────────────────────────────────────────
// Multer Upload Middleware – MediShield AI
// Configures disk-based storage for doctor profile photo uploads.
// Validates file type (images only) and enforces a 5 MB size limit.
// ─────────────────────────────────────────────────────────────────────────────
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ── Ensure upload directory exists at server startup ──────────────────────────
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ── Disk Storage Configuration ────────────────────────────────────────────────
const storage = multer.diskStorage({
  // Save all uploaded photos into the /uploads folder
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  // Generate a unique filename: doctor-<timestamp>-<random>.<ext>
  // Prevents collisions and avoids exposing original filenames
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `doctor-${uniqueSuffix}${ext}`);
  },
});

// ── File Type Filter ──────────────────────────────────────────────────────────
// Only accept common web-safe image formats
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext)) {
    cb(null, true);  // Accept the file
  } else {
    cb(new Error('Only JPG, PNG, and WEBP images are allowed'), false);
  }
};

// ── Multer Instance ───────────────────────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB maximum to keep server storage manageable
  },
});

module.exports = upload;

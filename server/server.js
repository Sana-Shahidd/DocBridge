// ─────────────────────────────────────────────────────────────────────────────
// MediShield AI – Main Express Server
// Entry point: connects to MongoDB, registers middleware and routes, starts app.
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// ── Route Imports ─────────────────────────────────────────────────────────────
const doctorRoutes       = require('./routes/doctors');
const chatlogRoutes      = require('./routes/chatlog');
const availabilityRoutes = require('./routes/availability');
const appointmentRoutes  = require('./routes/appointments');
const symptomRoutes      = require('./routes/symptoms');
const reviewRoutes       = require('./routes/reviews');
const { startJobs }      = require('./jobs/reminderJob');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Global Middleware ─────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server requests (no origin) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());                           // Parse JSON request bodies
app.use(express.urlencoded({ extended: true }));   // Parse URL-encoded bodies (form submissions)

// Serve uploaded profile photos as static files at /uploads/<filename>
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/doctors', doctorRoutes);
app.use('/api/chatlog', chatlogRoutes);
app.use('/api/doctors/:id/availability', availabilityRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/analyze-symptoms', symptomRoutes);
app.use('/api/reviews', reviewRoutes);

// Simple health check – useful for uptime monitoring / CI
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'MediShield AI API is running', timestamp: new Date() });
});

// ── 404 Handler (must come after all routes) ──────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── MongoDB Connection + Server Startup ───────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/medishield_ai';

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`🚀 MediShield AI API running → http://localhost:${PORT}`);
    });
    startJobs(); // Start hourly reminder & follow-up cron jobs
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

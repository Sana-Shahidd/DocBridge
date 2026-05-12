// ─────────────────────────────────────────────────────────────────────────────
// ChatLog REST API Routes – MediShield AI
//
//  POST  /api/chatlog              Save a completed patient conversation
//  GET   /api/chatlog              List all logs (optional ?doctorId= filter)
//  PATCH /api/chatlog/:id/status   Toggle status: pending ↔ contacted
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const ChatLog = require('../models/ChatLog');
const { sendDoctorNotification } = require('../utils/mailer');

// ── Reference number generator ────────────────────────────────────────────────
// Format: MS-XXXX-XXXX (short, memorable, uppercase alphanumeric)
function generateRef() {
  const seg = () => Math.random().toString(36).substr(2, 4).toUpperCase();
  return `MS-${seg()}-${seg()}`;
}

// ── POST /api/chatlog ─────────────────────────────────────────────────────────
// Called by the ChatWidget after the patient confirms their details.
// Saves the log and fires an email notification to the doctor.
router.post('/', async (req, res) => {
  try {
    const { doctorId, doctorName, doctorEmail, patientName, patientPhone, symptoms } = req.body;

    // Basic required-field check (Mongoose validators will catch the rest)
    if (!doctorId || !patientName || !patientPhone || !symptoms) {
      return res.status(400).json({
        success: false,
        message: 'doctorId, patientName, patientPhone, and symptoms are required.',
      });
    }

    const referenceNumber = generateRef();

    const log = new ChatLog({
      doctorId,
      doctorName: doctorName || 'Unknown Doctor',
      doctorEmail: doctorEmail || null,
      patientName,
      patientPhone,
      symptoms,
      referenceNumber,
    });

    await log.save();

    // Fire-and-forget email – don't block the API response if email fails
    sendDoctorNotification({ doctorEmail, doctorName, patientName, patientPhone, symptoms, referenceNumber })
      .then((result) => {
        if (result.sent) {
          // Mark email as sent without blocking
          ChatLog.findByIdAndUpdate(log._id, { emailSent: true }).exec();
        }
      })
      .catch((err) => console.error('Email notification error:', err));

    res.status(201).json({
      success: true,
      message: 'Patient message saved successfully.',
      referenceNumber,
      log,
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const msgs = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: msgs.join('; ') });
    }
    console.error('ChatLog POST error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── GET /api/chatlog ──────────────────────────────────────────────────────────
// Returns all logs, newest first.
// Optional query param: ?doctorId=<id>  filters by doctor
// Optional query param: ?status=pending|contacted
router.get('/', async (req, res) => {
  try {
    const filter = {};

    if (req.query.doctorId) filter.doctorId = req.query.doctorId;
    if (req.query.status)   filter.status   = req.query.status;

    const logs = await ChatLog
      .find(filter)
      .sort({ createdAt: -1 })
      .lean(); // lean() for faster read-only queries

    res.json({
      success: true,
      count:   logs.length,
      pending: logs.filter((l) => l.status === 'pending').length,
      logs,
    });
  } catch (err) {
    console.error('ChatLog GET error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── PATCH /api/chatlog/:id/status ─────────────────────────────────────────────
// Toggles a log's status between 'pending' and 'contacted'.
// The doctor dashboard calls this when they mark a patient as reached.
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!['pending', 'contacted'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status must be 'pending' or 'contacted'.",
      });
    }

    const log = await ChatLog.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!log) {
      return res.status(404).json({ success: false, message: 'Chat log not found.' });
    }

    res.json({ success: true, log });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid log ID.' });
    }
    console.error('ChatLog PATCH error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

module.exports = router;

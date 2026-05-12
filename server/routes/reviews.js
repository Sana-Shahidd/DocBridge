// ─────────────────────────────────────────────────────────────────────────────
// Review Routes – MediShield AI
//
//  POST /api/reviews          Submit feedback for a completed appointment
//  GET  /api/reviews          List reviews (?doctorId= or ?appointmentId=)
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const Review      = require('../models/Review');
const Doctor      = require('../models/Doctor');
const Appointment = require('../models/Appointment');

// ── POST /api/reviews ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { appointmentId, ratings, feedback } = req.body;

    if (!appointmentId || !ratings) {
      return res.status(400).json({ success: false, message: 'appointmentId and ratings are required.' });
    }

    const { punctuality, communication, diagnosis, overall } = ratings;
    for (const [key, val] of Object.entries({ punctuality, communication, diagnosis, overall })) {
      if (!val || val < 1 || val > 5) {
        return res.status(400).json({ success: false, message: `${key} rating must be 1–5.` });
      }
    }

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    const existing = await Review.findOne({ appointmentId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'This appointment has already been reviewed.' });
    }

    const review = await Review.create({
      appointmentId,
      doctorId:    appointment.doctorId,
      patientName: appointment.patientName,
      patientPhone: appointment.patientPhone,
      ratings: { punctuality, communication, diagnosis, overall },
      feedback: feedback || '',
    });

    // Recompute doctor's average rating
    const allReviews = await Review.find({ doctorId: appointment.doctorId }).lean();
    const avgOverall = allReviews.reduce((s, r) => s + r.ratings.overall, 0) / allReviews.length;
    await Doctor.findByIdAndUpdate(appointment.doctorId, {
      rating:       Math.round(avgOverall * 10) / 10,
      totalReviews: allReviews.length,
    });

    res.status(201).json({ success: true, review });
  } catch (err) {
    console.error('Review POST error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── GET /api/reviews ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { doctorId, appointmentId } = req.query;
    const filter = {};
    if (doctorId)     filter.doctorId     = doctorId;
    if (appointmentId) filter.appointmentId = appointmentId;

    const reviews = await Review.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, reviews });
  } catch (err) {
    console.error('Review GET error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

module.exports = router;

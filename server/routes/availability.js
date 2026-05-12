// ─────────────────────────────────────────────────────────────────────────────
// Doctor Availability Routes – MediShield AI
//
//  PUT  /api/doctors/:id/availability          Upsert slots for one date
//  GET  /api/doctors/:id/availability          All availability (optional date range)
//  GET  /api/doctors/:id/availability/:date    Slots for a single date
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router({ mergeParams: true }); // inherit :id from parent
const DoctorAvailability = require('../models/DoctorAvailability');
const Appointment = require('../models/Appointment');

// ── Valid 30-minute slots 09:00 → 20:30 ──────────────────────────────────────
const VALID_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const h = Math.floor(i / 2) + 9;
  const m = (i % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

// ── PUT /api/doctors/:id/availability ─────────────────────────────────────────
// Body: { date: "YYYY-MM-DD", slots: ["09:00", "09:30", …] }
// Replaces/creates the availability doc for that doctor+date pair.
// Slots that are already booked retain their booked state even if the doctor
// removes them from the new list (we preserve existing bookings).
router.put('/', async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { date, slots } = req.body;

    if (!date || !Array.isArray(slots)) {
      return res.status(400).json({ success: false, message: '`date` and `slots` array are required.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Date must be YYYY-MM-DD.' });
    }

    // Validate each slot
    const invalid = slots.filter((s) => !VALID_SLOTS.includes(s));
    if (invalid.length) {
      return res.status(400).json({ success: false, message: `Invalid slots: ${invalid.join(', ')}` });
    }

    // Fetch any existing doc so we can preserve booked flags
    const existing = await DoctorAvailability.findOne({ doctorId, date });
    const bookedTimes = new Set(
      existing?.slots.filter((s) => s.isBooked).map((s) => s.time) ?? []
    );

    // Build new slots array — re-add booked slots the doctor may have deselected
    // (we can't un-book a slot just by removing it from the grid)
    const allSlotTimes = new Set([...slots, ...bookedTimes]);
    const newSlots = [...allSlotTimes].sort().map((time) => ({
      time,
      isBooked: bookedTimes.has(time),
    }));

    const doc = await DoctorAvailability.findOneAndUpdate(
      { doctorId, date },
      { doctorId, date, slots: newSlots },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ success: true, availability: doc });
  } catch (err) {
    console.error('Availability PUT error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── GET /api/doctors/:id/availability ────────────────────────────────────────
// Optional query params: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Returns dates that have at least one unbooked slot (useful for calendar UI).
router.get('/', async (req, res) => {
  try {
    const doctorId = req.params.id;
    const filter = { doctorId };

    if (req.query.startDate || req.query.endDate) {
      filter.date = {};
      if (req.query.startDate) filter.date.$gte = req.query.startDate;
      if (req.query.endDate)   filter.date.$lte = req.query.endDate;
    }

    const docs = await DoctorAvailability.find(filter).sort({ date: 1 }).lean();

    // Enrich each doc with available (unbooked) slot count
    const availability = docs.map((d) => ({
      date:           d.date,
      totalSlots:     d.slots.length,
      availableSlots: d.slots.filter((s) => !s.isBooked).length,
      slots:          d.slots,
    }));

    res.json({ success: true, availability });
  } catch (err) {
    console.error('Availability GET error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── GET /api/doctors/:id/availability/:date ───────────────────────────────────
// Detailed slot list for one specific date.
router.get('/:date', async (req, res) => {
  try {
    const { id: doctorId, date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Date must be YYYY-MM-DD.' });
    }

    const doc = await DoctorAvailability.findOne({ doctorId, date }).lean();
    if (!doc) {
      return res.json({ success: true, date, slots: [] });
    }

    res.json({ success: true, date, slots: doc.slots });
  } catch (err) {
    console.error('Availability GET/:date error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

module.exports = router;

// ─────────────────────────────────────────────────────────────────────────────
// Doctor REST API Routes – MediShield AI
//
//  POST   /api/doctors/register          Register a new doctor
//  GET    /api/doctors                   List all doctors (admin / debug)
//  GET    /api/doctors/:id               Fetch a single doctor profile
//  PUT    /api/doctors/:id/availability  Toggle doctor's availability status
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const Doctor            = require('../models/Doctor');
const DoctorAvailability = require('../models/DoctorAvailability');
const upload            = require('../middleware/upload');

// Pakistan-local date string helpers
function pkDate(offsetDays = 0) {
  const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

// Find the first future unbooked slot across availability docs for one doctor.
// Returns { nextAvailable: ISOString|null, waitHours: number|null }
async function findNextSlot(doctorId, today) {
  const docs = await DoctorAvailability.find({
    doctorId,
    date: { $gte: today },
  }).sort({ date: 1 }).limit(14).lean();

  const nowMs = Date.now();
  for (const doc of docs) {
    for (const slot of doc.slots) {
      if (slot.isBooked) continue;
      const slotMs = new Date(`${doc.date}T${slot.time}:00+05:00`).getTime();
      if (slotMs <= nowMs) continue;
      return {
        nextAvailable: new Date(slotMs).toISOString(),
        waitHours:     (slotMs - nowMs) / 36e5,
      };
    }
  }
  return { nextAvailable: null, waitHours: null };
}

// ── POST /api/doctors/register ────────────────────────────────────────────────
// Accepts multipart/form-data so the profile photo can be uploaded in the same
// request as the doctor's text fields. `upload.single('profilePhoto')` processes
// the file before the handler runs; the result is on req.file.
router.post('/register', upload.single('profilePhoto'), async (req, res) => {
  try {
    const {
      fullName,
      pmdcNumber,
      specialization,
      city,
      consultationType,
      hourlyFee,
      yearsOfExperience,
      bio,
    } = req.body;

    // Assemble the doctor document from validated request fields
    const doctorData = {
      fullName,
      pmdcNumber,
      specialization,
      city,
      consultationType,
      hourlyFee: Number(hourlyFee),
      yearsOfExperience: Number(yearsOfExperience),
      bio,
    };

    // Attach photo path only when a file was successfully uploaded
    if (req.file) {
      doctorData.profilePhoto = `/uploads/${req.file.filename}`;
    }

    const doctor = new Doctor(doctorData);
    await doctor.save();

    res.status(201).json({
      success: true,
      message: 'Doctor registered successfully. Pending PMDC verification.',
      doctor,
    });
  } catch (err) {
    // Duplicate PMDC number (unique index violation)
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A doctor with this PMDC number is already registered.',
      });
    }

    // Mongoose schema validation failures – surface all field errors at once
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join('; ') });
    }

    // Multer file filter rejection
    if (err.message && err.message.includes('Only JPG')) {
      return res.status(400).json({ success: false, message: err.message });
    }

    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── GET /api/doctors/availability-summary ────────────────────────────────────
// Returns booking rate + next free slot for every active doctor this week.
// MUST be defined before /:id to avoid "availability-summary" being treated as an id.
router.get('/availability-summary', async (req, res) => {
  try {
    const today    = pkDate(0);
    const weekEnd  = pkDate(6);

    const doctors = await Doctor.find({ isAvailable: true }).select('_id fullName specialization').lean();

    const results = await Promise.all(doctors.map(async (doc) => {
      const avails = await DoctorAvailability.find({
        doctorId: doc._id,
        date:     { $gte: today, $lte: weekEnd },
      }).lean();

      let totalSlots = 0;
      let bookedSlots = 0;
      avails.forEach((a) => {
        totalSlots  += a.slots.length;
        bookedSlots += a.slots.filter((s) => s.isBooked).length;
      });

      const bookingRate = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;
      const { nextAvailable } = await findNextSlot(doc._id, today);

      return {
        doctorId:    doc._id,
        name:        doc.fullName,
        specialization: doc.specialization,
        bookingRate,
        nextFreeSlot: nextAvailable,
      };
    }));

    res.json({ success: true, summary: results });
  } catch (err) {
    console.error('Availability summary error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── GET /api/doctors ──────────────────────────────────────────────────────────
// Returns all doctors sorted by newest first. Intended for admin panels or demo.
router.get('/', async (req, res) => {
  try {
    const doctors = await Doctor.find().sort({ createdAt: -1 });
    res.json({ success: true, count: doctors.length, doctors });
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── GET /api/doctors/:id ──────────────────────────────────────────────────────
// Fetch the full profile of a single doctor by their MongoDB ObjectId.
router.get('/:id', async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found.' });
    }

    res.json({ success: true, doctor });
  } catch (err) {
    // CastError means the ID string is not a valid ObjectId format
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid doctor ID format.' });
    }
    console.error('Fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── PUT /api/doctors/:id/availability ────────────────────────────────────────
// Updates a doctor's `isAvailable` flag.
// Body: { "isAvailable": true | false }
router.put('/:id/availability', async (req, res) => {
  try {
    const { isAvailable } = req.body;

    // Strict type check — accept only explicit booleans, not truthy strings
    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: '`isAvailable` must be a boolean (true or false).',
      });
    }

    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { isAvailable },
      {
        new: true,           // Return the updated document, not the original
        runValidators: true, // Still run schema validators on the updated fields
      }
    );

    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found.' });
    }

    res.json({
      success: true,
      message: `Dr. ${doctor.fullName} is now ${isAvailable ? 'available' : 'unavailable'}.`,
      doctor,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid doctor ID format.' });
    }
    console.error('Availability update error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── GET /api/doctors/:id/next-available ──────────────────────────────────────
router.get('/:id/next-available', async (req, res) => {
  try {
    const doctorId = req.params.id;
    const doctor   = await Doctor.findById(doctorId).lean();
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found.' });

    const today = pkDate(0);
    const nowMs = Date.now();

    // Count unbooked future slots today
    const todayDoc = await DoctorAvailability.findOne({ doctorId, date: today }).lean();
    const slotsAvailableToday = todayDoc
      ? todayDoc.slots.filter((s) => {
          if (s.isBooked) return false;
          return new Date(`${today}T${s.time}:00+05:00`).getTime() > nowMs;
        }).length
      : 0;

    const { nextAvailable, waitHours } = await findNextSlot(doctorId, today);

    // Find up to 2 alternative doctors with same specialization and shorter wait
    const altDoctors = await Doctor.find({
      specialization: doctor.specialization,
      _id: { $ne: doctorId },
      isAvailable: true,
    }).limit(6).lean();

    const alts = [];
    for (const alt of altDoctors) {
      const { nextAvailable: altNext, waitHours: altWait } = await findNextSlot(alt._id, today);
      if (altNext && (waitHours === null || altWait < waitHours)) {
        alts.push({ id: alt._id, name: alt.fullName, specialization: alt.specialization, nextAvailable: altNext, waitHours: altWait });
      }
      if (alts.length >= 2) break;
    }
    alts.sort((a, b) => a.waitHours - b.waitHours);

    res.json({
      success: true,
      nextAvailable,
      waitHours:           waitHours !== null ? Math.round(waitHours * 10) / 10 : null,
      slotsAvailableToday,
      alternativeDoctors:  alts.slice(0, 2),
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid doctor ID format.' });
    }
    console.error('Next-available error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

module.exports = router;

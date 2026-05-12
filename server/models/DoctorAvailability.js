// ─────────────────────────────────────────────────────────────────────────────
// DoctorAvailability Model – MediShield AI
//
// One document per doctor per date.
// Each slot tracks its booked state so we can efficiently check conflicts
// and display remaining capacity without joining the Appointments collection.
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema(
  {
    time:     { type: String, required: true }, // "09:00", "09:30", …, "20:30"
    isBooked: { type: Boolean, default: false },
  },
  { _id: false } // No separate _id per slot – indexed via parent + time
);

const doctorAvailabilitySchema = new mongoose.Schema(
  {
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
    },
    // ISO date string YYYY-MM-DD (Pakistan local date, no timezone conversion)
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'],
    },
    slots: [slotSchema],
  },
  { timestamps: true }
);

// Unique constraint: one availability doc per doctor per date
doctorAvailabilitySchema.index({ doctorId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DoctorAvailability', doctorAvailabilitySchema);

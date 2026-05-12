// ─────────────────────────────────────────────────────────────────────────────
// Review Model – MediShield AI
// One review per appointment. Submitting updates the doctor's rating average.
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      unique: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
    },
    patientName:  { type: String, required: true, trim: true },
    patientPhone: { type: String, required: true, trim: true },

    ratings: {
      punctuality:   { type: Number, min: 1, max: 5, required: true },
      communication: { type: Number, min: 1, max: 5, required: true },
      diagnosis:     { type: Number, min: 1, max: 5, required: true },
      overall:       { type: Number, min: 1, max: 5, required: true },
    },

    feedback: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

reviewSchema.index({ doctorId: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Appointment Model – MediShield AI
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    // ── Doctor snapshot (denormalised so dashboard still works after edits) ───
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
    },
    doctorName:           { type: String, required: true, trim: true },
    doctorSpecialization: { type: String, default: '' },
    doctorEmail:          { type: String, default: null },
    doctorFee:            { type: Number, required: true },

    // ── Patient details ───────────────────────────────────────────────────────
    patientName:  { type: String, required: [true, 'Patient name is required'], trim: true },
    patientPhone: { type: String, required: [true, 'Phone number is required'], trim: true },
    patientEmail: { type: String, default: null, trim: true, lowercase: true },

    // ── Appointment specifics ─────────────────────────────────────────────────
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'],
    },
    time: {
      type: String,
      required: true,
      match: [/^\d{2}:\d{2}$/, 'Time must be HH:MM'],
    },
    type: {
      type: String,
      required: true,
      enum: { values: ['online', 'physical'], message: 'Type must be online or physical' },
    },
    note:               { type: String, trim: true, maxlength: 500, default: '' },
    referenceNumber:    { type: String, unique: true, required: true },

    status: {
      type: String,
      enum: ['confirmed', 'cancelled', 'completed'],
      default: 'confirmed',
    },
    cancellationReason: { type: String, default: '' },

    // ── Automated reminder / follow-up tracking ───────────────────────────────
    reminderSent:      { type: Boolean, default: false },
    followupSent:      { type: Boolean, default: false },

    // ── Doctor follow-up note (added from Doctor Dashboard) ──────────────────
    doctorNote:           { type: String, trim: true, maxlength: 1000, default: '' },
    returnInDays:         { type: Number, default: null }, // e.g. 7 → patient should return in 7 days
    returnReminderDate:   { type: String, default: null }, // YYYY-MM-DD computed from completedAt + returnInDays
    returnReminderSent:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

appointmentSchema.index({ doctorId: 1, date: 1, time: 1 });
appointmentSchema.index({ patientPhone: 1, date: 1 });
appointmentSchema.index({ date: 1, status: 1, reminderSent: 1 });   // for reminder job
appointmentSchema.index({ date: 1, status: 1, followupSent: 1 });   // for follow-up job
appointmentSchema.index({ returnReminderDate: 1, returnReminderSent: 1 }); // for return reminder job

module.exports = mongoose.model('Appointment', appointmentSchema);

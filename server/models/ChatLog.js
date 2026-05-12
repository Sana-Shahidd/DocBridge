// ─────────────────────────────────────────────────────────────────────────────
// ChatLog Mongoose Model – MediShield AI
//
// Stores every patient conversation collected by the AI chatbot when a doctor
// is offline. Each document represents one completed patient inquiry.
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const chatLogSchema = new mongoose.Schema(
  {
    // ── Doctor reference ──────────────────────────────────────────────────────
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'Doctor ID is required'],
    },
    doctorName: {
      type: String,
      required: true,
      trim: true,
    },
    // Email address the notification was sent to
    doctorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    // ── Patient details collected by the chatbot ───────────────────────────────
    patientName: {
      type: String,
      required: [true, 'Patient name is required'],
      trim: true,
    },
    patientPhone: {
      type: String,
      required: [true, 'Patient WhatsApp number is required'],
      trim: true,
    },
    symptoms: {
      type: String,
      required: [true, 'Symptom description is required'],
      trim: true,
    },

    // ── Tracking ──────────────────────────────────────────────────────────────
    // Short human-readable reference the patient receives (e.g. MS-K2X9-AF3B)
    referenceNumber: {
      type: String,
      unique: true,
      required: true,
    },

    // Whether the doctor has seen and acted on this inquiry
    status: {
      type: String,
      enum: {
        values: ['pending', 'contacted'],
        message: 'Status must be pending or contacted',
      },
      default: 'pending',
    },

    // True once the notification email has been dispatched
    emailSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    // Adds createdAt (= conversation timestamp) and updatedAt automatically
    timestamps: true,
  }
);

// ── Index for fast dashboard queries by doctor ────────────────────────────────
chatLogSchema.index({ doctorId: 1, createdAt: -1 });
chatLogSchema.index({ status: 1 });

module.exports = mongoose.model('ChatLog', chatLogSchema);

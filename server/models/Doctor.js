// ─────────────────────────────────────────────────────────────────────────────
// Doctor Mongoose Model – MediShield AI
// Defines schema, validation rules, and allowed enum values for doctor profiles.
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

// ── Enum Constants ─────────────────────────────────────────────────────────────
// 25 Pakistani medical specializations recognised by PMDC
const SPECIALIZATIONS = [
  'General Physician',
  'Cardiologist',
  'Dermatologist',
  'Neurologist',
  'Orthopedic Surgeon',
  'Gynecologist / Obstetrician',
  'Pediatrician',
  'Psychiatrist',
  'Ophthalmologist',
  'ENT Specialist',
  'Urologist',
  'Gastroenterologist',
  'Endocrinologist',
  'Pulmonologist',
  'Rheumatologist',
  'Oncologist',
  'Nephrologist',
  'Hematologist',
  'Radiologist',
  'Anesthesiologist',
  'Plastic Surgeon',
  'Vascular Surgeon',
  'Neurosurgeon',
  'Hepatologist',
  'Diabetologist',
];

// 18 major Pakistani cities supported by MediShield AI
const CITIES = [
  'Karachi',
  'Lahore',
  'Islamabad',
  'Peshawar',
  'Quetta',
  'Multan',
  'Faisalabad',
  'Rawalpindi',
  'Hyderabad',
  'Sialkot',
  'Gujranwala',
  'Bahawalpur',
  'Sargodha',
  'Abbottabad',
  'Sukkur',
  'Larkana',
  'Dera Ghazi Khan',
  'Mardan',
];

// ── Schema Definition ──────────────────────────────────────────────────────────
const doctorSchema = new mongoose.Schema(
  {
    // ── Personal Information ────────────────────────────────────────────────────
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [3, 'Name must be at least 3 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },

    // PMDC = Pakistan Medical & Dental Council — every licensed doctor has one
    pmdcNumber: {
      type: String,
      required: [true, 'PMDC registration number is required'],
      unique: true,          // Prevents duplicate registrations
      trim: true,
      uppercase: true,       // Normalise to uppercase for consistent lookup
    },

    specialization: {
      type: String,
      required: [true, 'Specialization is required'],
      enum: {
        values: SPECIALIZATIONS,
        message: '{VALUE} is not a recognised specialization',
      },
    },

    city: {
      type: String,
      required: [true, 'City is required'],
      enum: {
        values: CITIES,
        message: '{VALUE} is not a supported city',
      },
    },

    // How the doctor sees patients: online video call, in-person, or either
    consultationType: {
      type: String,
      required: [true, 'Consultation type is required'],
      enum: {
        values: ['Online', 'Physical', 'Both'],
        message: 'Consultation type must be Online, Physical, or Both',
      },
    },

    // Relative URL path to the uploaded photo, e.g. /uploads/doctor-123.jpg
    profilePhoto: {
      type: String,
      default: null,
    },

    // Per-consultation fee in Pakistani Rupees (PKR)
    hourlyFee: {
      type: Number,
      required: [true, 'Consultation fee is required'],
      min: [100, 'Fee must be at least PKR 100'],
      max: [100000, 'Fee cannot exceed PKR 100,000'],
    },

    yearsOfExperience: {
      type: Number,
      required: [true, 'Years of experience is required'],
      min: [0, 'Experience cannot be negative'],
      max: [60, 'Experience value seems unrealistic'],
    },

    // Professional bio — capped at ~200 words (1 500 chars is a safe upper bound)
    bio: {
      type: String,
      required: [true, 'Bio is required'],
      trim: true,
      maxlength: [1500, 'Bio is too long (max ~200 words / 1 500 characters)'],
    },

    // ── Computed / System-Managed Fields ───────────────────────────────────────

    // Aggregate star rating (0–5). Updated by the review service.
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    // Number of patient reviews that produced `rating`
    totalReviews: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Whether the doctor is currently accepting new appointments
    isAvailable: {
      type: Boolean,
      default: true,
    },

    // Set to true by admin after verifying PMDC credentials against the PMDC portal
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    // Automatically add `createdAt` and `updatedAt` timestamps to every document
    timestamps: true,
  }
);

// ── Static Constants Export ────────────────────────────────────────────────────
// Attach lists to the model so frontend seed data and route handlers can reuse them
doctorSchema.statics.SPECIALIZATIONS = SPECIALIZATIONS;
doctorSchema.statics.CITIES = CITIES;

module.exports = mongoose.model('Doctor', doctorSchema);

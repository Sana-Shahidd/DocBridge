// ─────────────────────────────────────────────────────────────────────────────
// DoctorRegistrationForm – MediShield AI
//
// Full multi-section registration form for Pakistani doctors.
// Handles client-side validation, photo preview, and multipart POST to the API.
// Props:
//   onSuccess(doctor) – called with the saved doctor document on successful POST
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import { registerDoctor } from '../api/doctorApi';

// ── Static dropdown data ──────────────────────────────────────────────────────

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

// ── Field error helper ────────────────────────────────────────────────────────
function FieldError({ msg }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-500">{msg}</p>;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DoctorRegistrationForm({ onSuccess }) {
  // Controlled form fields
  const [form, setForm] = useState({
    fullName: '',
    pmdcNumber: '',
    specialization: '',
    city: '',
    consultationType: '',
    hourlyFee: '',
    yearsOfExperience: '',
    bio: '',
  });

  const [photoFile, setPhotoFile]     = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [errors, setErrors]           = useState({});
  const [loading, setLoading]         = useState(false);
  const [serverError, setServerError] = useState('');

  const fileInputRef = useRef(null);

  // ── Generic field change handler ──────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear that field's error as the user types
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  // ── Photo selection + local preview ──────────────────────────────────────
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    // createObjectURL gives an instant local preview without uploading yet
    setPhotoPreview(URL.createObjectURL(file));
  };

  // ── Client-side validation ────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.fullName.trim())
      e.fullName = 'Full name is required';
    if (!form.pmdcNumber.trim())
      e.pmdcNumber = 'PMDC registration number is required';
    if (!form.specialization)
      e.specialization = 'Please select a specialization';
    if (!form.city)
      e.city = 'Please select your city';
    if (!form.consultationType)
      e.consultationType = 'Please select consultation type';
    if (!form.hourlyFee || isNaN(form.hourlyFee) || Number(form.hourlyFee) < 100)
      e.hourlyFee = 'Enter a valid fee (minimum PKR 100)';
    if (form.yearsOfExperience === '' || isNaN(form.yearsOfExperience) || Number(form.yearsOfExperience) < 0)
      e.yearsOfExperience = 'Enter a valid number of years (0 or more)';
    if (!form.bio.trim()) {
      e.bio = 'Bio is required';
    } else if (form.bio.trim().split(/\s+/).length > 200) {
      e.bio = 'Bio must not exceed 200 words';
    }
    return e;
  };

  // ── Form submission ───────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      // Scroll to the first error
      document.querySelector('.text-red-500')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setLoading(true);
    try {
      // Build a FormData object so the photo binary can travel with text fields
      const formData = new FormData();
      Object.entries(form).forEach(([key, val]) => formData.append(key, val));
      if (photoFile) formData.append('profilePhoto', photoFile);

      const result = await registerDoctor(formData);
      onSuccess(result.doctor); // Bubble the saved doctor up to App
    } catch (err) {
      setServerError(
        err.response?.data?.message || 'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Live word count for the bio textarea
  const bioWordCount = form.bio.trim() ? form.bio.trim().split(/\s+/).length : 0;
  const bioOverLimit = bioWordCount > 200;

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-8">

      {/* ── Form Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-shrink-0 w-12 h-12 bg-primary-100 rounded-2xl flex items-center justify-center">
          {/* Medical cross icon */}
          <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Doctor Registration</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Join MediShield AI's verified doctor network
          </p>
        </div>
      </div>

      {/* ── Server error banner ──────────────────────────────────────────────── */}
      {serverError && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8" noValidate>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 1 – Personal Information
        ════════════════════════════════════════════════════════════════════ */}
        <section>
          <h3 className="section-heading">Personal Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

            {/* Full Name */}
            <div>
              <label className="form-label">Full Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                name="fullName"
                value={form.fullName}
                onChange={handleChange}
                placeholder="Dr. Ahmed Hassan"
                className={`form-input ${errors.fullName ? 'border-red-400 ring-2 ring-red-100' : ''}`}
              />
              <FieldError msg={errors.fullName} />
            </div>

            {/* PMDC Registration Number */}
            <div>
              <label className="form-label">
                PMDC Registration Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="pmdcNumber"
                value={form.pmdcNumber}
                onChange={handleChange}
                placeholder="PMDC-12345-P"
                className={`form-input uppercase ${errors.pmdcNumber ? 'border-red-400 ring-2 ring-red-100' : ''}`}
              />
              <FieldError msg={errors.pmdcNumber} />
            </div>

            {/* Specialization Dropdown */}
            <div>
              <label className="form-label">Specialization <span className="text-red-500">*</span></label>
              <select
                name="specialization"
                value={form.specialization}
                onChange={handleChange}
                className={`form-input ${errors.specialization ? 'border-red-400 ring-2 ring-red-100' : ''}`}
              >
                <option value="">Select specialization...</option>
                {SPECIALIZATIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <FieldError msg={errors.specialization} />
            </div>

            {/* City Dropdown */}
            <div>
              <label className="form-label">City <span className="text-red-500">*</span></label>
              <select
                name="city"
                value={form.city}
                onChange={handleChange}
                className={`form-input ${errors.city ? 'border-red-400 ring-2 ring-red-100' : ''}`}
              >
                <option value="">Select city...</option>
                {CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <FieldError msg={errors.city} />
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 2 – Practice Details
        ════════════════════════════════════════════════════════════════════ */}
        <section>
          <h3 className="section-heading">Practice Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

            {/* Consultation Type */}
            <div>
              <label className="form-label">Consultation Type <span className="text-red-500">*</span></label>
              <select
                name="consultationType"
                value={form.consultationType}
                onChange={handleChange}
                className={`form-input ${errors.consultationType ? 'border-red-400 ring-2 ring-red-100' : ''}`}
              >
                <option value="">Select type...</option>
                <option value="Online">Online (Video/Chat)</option>
                <option value="Physical">Physical (Clinic)</option>
                <option value="Both">Both</option>
              </select>
              <FieldError msg={errors.consultationType} />
            </div>

            {/* Consultation Fee */}
            <div>
              <label className="form-label">Consultation Fee (PKR) <span className="text-red-500">*</span></label>
              <div className="relative">
                {/* Rupee symbol overlay */}
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">₨</span>
                <input
                  type="number"
                  name="hourlyFee"
                  value={form.hourlyFee}
                  onChange={handleChange}
                  placeholder="1500"
                  min="100"
                  className={`form-input pl-8 ${errors.hourlyFee ? 'border-red-400 ring-2 ring-red-100' : ''}`}
                />
              </div>
              <FieldError msg={errors.hourlyFee} />
            </div>

            {/* Years of Experience */}
            <div>
              <label className="form-label">Years of Experience <span className="text-red-500">*</span></label>
              <input
                type="number"
                name="yearsOfExperience"
                value={form.yearsOfExperience}
                onChange={handleChange}
                placeholder="5"
                min="0"
                max="60"
                className={`form-input ${errors.yearsOfExperience ? 'border-red-400 ring-2 ring-red-100' : ''}`}
              />
              <FieldError msg={errors.yearsOfExperience} />
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 3 – Profile Photo
        ════════════════════════════════════════════════════════════════════ */}
        <section>
          <h3 className="section-heading">Profile Photo</h3>
          <div className="flex items-center gap-6">

            {/* Circular preview – clicking it opens the file picker */}
            <button
              type="button"
              onClick={() => fileInputRef.current.click()}
              className="flex-shrink-0 w-24 h-24 rounded-full border-2 border-dashed border-gray-300
                         hover:border-primary-400 transition-colors overflow-hidden
                         focus:outline-none focus:ring-2 focus:ring-primary-400"
              aria-label="Upload profile photo"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Profile preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-xs mt-1">Photo</span>
                </div>
              )}
            </button>

            {/* Upload instructions */}
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current.click()}
                className="text-sm font-semibold text-primary-600 hover:text-primary-800 transition-colors"
              >
                {photoPreview ? 'Change photo' : 'Upload profile photo'}
              </button>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, or WEBP — max 5 MB</p>
              <p className="text-xs text-gray-400">A clear headshot builds patient trust</p>
            </div>

            {/* Hidden native file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 4 – Professional Bio
        ════════════════════════════════════════════════════════════════════ */}
        <section>
          <h3 className="section-heading">Professional Bio</h3>
          <div>
            {/* Label row with live word counter */}
            <div className="flex justify-between items-baseline mb-1">
              <label className="form-label mb-0">
                Bio <span className="text-red-500">*</span>
              </label>
              <span className={`text-xs font-medium ${bioOverLimit ? 'text-red-500' : bioWordCount > 160 ? 'text-orange-500' : 'text-gray-400'}`}>
                {bioWordCount} / 200 words
              </span>
            </div>
            <textarea
              name="bio"
              value={form.bio}
              onChange={handleChange}
              rows={5}
              placeholder="Describe your qualifications, clinical experience, hospital affiliations, and areas of expertise. Help patients understand why they should trust you with their health..."
              className={`form-input resize-none leading-relaxed ${errors.bio ? 'border-red-400 ring-2 ring-red-100' : ''}`}
            />
            <FieldError msg={errors.bio} />
          </div>
        </section>

        {/* ── Submit ────────────────────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3.5"
        >
          {loading ? (
            <>
              {/* Spinning loader */}
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Submitting...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Register as Doctor
            </>
          )}
        </button>

        <p className="text-center text-xs text-gray-400">
          By registering you agree to MediShield AI's Terms of Service.
          Your PMDC number will be verified before your profile goes live.
        </p>
      </form>
    </div>
  );
}

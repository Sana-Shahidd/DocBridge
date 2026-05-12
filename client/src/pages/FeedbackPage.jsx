import { useState, useEffect } from 'react';
import { submitReview, getReviews } from '../api/reviewApi';

const CATEGORIES = [
  { key: 'punctuality',   label: 'Punctuality',    desc: 'Did the doctor see you on time?' },
  { key: 'communication', label: 'Communication',  desc: 'Was the doctor clear and easy to understand?' },
  { key: 'diagnosis',     label: 'Diagnosis',      desc: 'Were you satisfied with the diagnosis and advice?' },
  { key: 'overall',       label: 'Overall',        desc: 'How would you rate your overall experience?' },
];

function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-110 focus:outline-none"
        >
          <svg
            className={`w-8 h-8 transition-colors ${
              n <= (hovered || value) ? 'text-yellow-400' : 'text-gray-200'
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

export default function FeedbackPage({ appointmentId: propAppointmentId }) {
  const [appointmentId, setAppointmentId] = useState(propAppointmentId || '');
  const [ratings, setRatings] = useState({ punctuality: 0, communication: 0, diagnosis: 0, overall: 0 });
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [checking, setChecking] = useState(false);

  // Read appointmentId from URL ?appointmentId=xxx if not passed as prop
  useEffect(() => {
    if (!propAppointmentId) {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('appointmentId');
      if (id) setAppointmentId(id);
    }
  }, [propAppointmentId]);

  // Check if review already exists for this appointment
  useEffect(() => {
    if (!appointmentId) return;
    setChecking(true);
    getReviews({ appointmentId })
      .then((data) => {
        if (data.reviews?.length > 0) setAlreadyReviewed(true);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [appointmentId]);

  const allRated = CATEGORIES.every((c) => ratings[c.key] > 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!appointmentId.trim()) { setError('Appointment ID is required.'); return; }
    if (!allRated) { setError('Please rate all categories.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await submitReview({ appointmentId: appointmentId.trim(), ratings, feedback });
      if (res.success) {
        setSubmitted(true);
      } else {
        setError(res.message || 'Submission failed. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-primary-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 max-w-sm w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Thank You!</h2>
          <p className="text-sm text-gray-500 mb-1">Your feedback has been submitted.</p>
          <p className="text-xs text-gray-400">It helps us improve and supports other patients in choosing the right doctor.</p>
          <div className="mt-6 flex justify-center gap-1">
            {[1,2,3,4,5].map((n) => (
              <svg key={n} className={`w-6 h-6 ${n <= ratings.overall ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
              </svg>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Already reviewed screen ───────────────────────────────────────────────
  if (alreadyReviewed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-primary-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Already Reviewed</h2>
          <p className="text-sm text-gray-500">You've already submitted feedback for this appointment. Thank you!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-primary-50 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-lg w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">Rate Your Experience</h1>
          <p className="text-sm text-gray-500 mt-1">Your honest feedback helps improve care for everyone</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">

          {/* Appointment ID input (if not pre-filled) */}
          {!propAppointmentId && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Appointment Reference <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={appointmentId}
                onChange={(e) => { setAppointmentId(e.target.value); setAlreadyReviewed(false); }}
                placeholder="e.g. MS-2024-XXXXX"
                className="form-input font-mono text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">Find this in your confirmation email or booking details</p>
            </div>
          )}

          {/* Rating categories */}
          <div className="flex flex-col gap-5">
            {CATEGORIES.map(({ key, label, desc }) => (
              <div key={key} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  {ratings[key] > 0 && (
                    <span className="text-xs font-semibold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                      {STAR_LABELS[ratings[key]]}
                    </span>
                  )}
                </div>
                <StarPicker
                  value={ratings[key]}
                  onChange={(v) => setRatings((prev) => ({ ...prev, [key]: v }))}
                />
              </div>
            ))}
          </div>

          {/* Text feedback */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Additional Comments <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Share anything else about your visit…"
              className="form-input resize-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{feedback.length}/500</p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || checking || !allRated}
            className={`btn-primary w-full py-3 text-base font-bold
              ${(!allRated || submitting || checking) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {submitting ? 'Submitting…' : checking ? 'Checking…' : 'Submit Feedback'}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Your feedback is anonymous and used solely to improve doctor quality.
          </p>
        </form>
      </div>
    </div>
  );
}

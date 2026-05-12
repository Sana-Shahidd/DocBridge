// ─────────────────────────────────────────────────────────────────────────────
// DoctorProfileCard – MediShield AI
//
// Displays a doctor's public profile in a clean card layout.
// Features: photo, name, specialization badge, city, consultation type,
//           availability indicator, star rating, fee, bio excerpt,
//           and a "Book Appointment" CTA button.
//
// Props:
//   doctor                  – Doctor document from the API
//   showAvailabilityToggle  – Render the "Set Available / Unavailable" button
//                             (true when viewing your own profile)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { updateAvailability } from '../api/doctorApi';
import ChatWidget from './chat/ChatWidget';
import { useBooking } from '../context/BookingContext';
import WaitTimeBadge from './WaitTimeBadge';
import DoctorAvailabilityMini from './DoctorAvailabilityMini';
import AlternativeDoctorBanner from './AlternativeDoctorBanner';
import { getNextAvailable } from '../api/waitTimeApi';

// ── Star Rating sub-component ─────────────────────────────────────────────────
function StarRating({ rating, maxStars = 5 }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of 5`}>
      {Array.from({ length: maxStars }, (_, i) => {
        // Determine whether this star should be fully or partially filled
        const isFull    = i + 1 <= Math.floor(rating);
        const isPartial = !isFull && i < rating;

        return (
          <svg
            key={i}
            className={`w-4 h-4 ${isFull ? 'text-yellow-400' : isPartial ? 'text-yellow-300' : 'text-gray-200'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        );
      })}
    </div>
  );
}

// ── Badge colour mapping for consultation type ────────────────────────────────
const CONSULT_BADGE = {
  Online:   'bg-emerald-100 text-emerald-700',
  Physical: 'bg-blue-100   text-blue-700',
  Both:     'bg-violet-100 text-violet-700',
};

const CONSULT_LABEL = {
  Online:   'Online',
  Physical: 'Clinic',
  Both:     'Online & Clinic',
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function DoctorProfileCard({ doctor: initialDoctor, showAvailabilityToggle = false }) {
  const [doctor, setDoctor]           = useState(initialDoctor);
  const [toggling, setToggling]       = useState(false);
  const [chatOpen, setChatOpen]       = useState(false);
  const [waitHours, setWaitHours]     = useState(undefined);
  const [nextAvail, setNextAvail]     = useState(undefined);
  const [alternatives, setAlternatives] = useState([]);
  const { openBooking } = useBooking();

  useEffect(() => {
    if (!doctor?._id) return;
    getNextAvailable(doctor._id)
      .then((r) => {
        if (r.success) {
          setWaitHours(r.waitHours);
          setNextAvail(r.nextAvailable);
          setAlternatives(r.alternativeDoctors || []);
        }
      })
      .catch(() => {});
  }, [doctor._id]);

  // Toggle availability via API; update local state optimistically
  const handleToggleAvailability = async () => {
    setToggling(true);
    try {
      const result = await updateAvailability(doctor._id, !doctor.isAvailable);
      setDoctor(result.doctor);
    } catch (err) {
      console.error('Availability update failed:', err.response?.data?.message || err.message);
    } finally {
      setToggling(false);
    }
  };

  // Use uploaded photo or fall back to a generated avatar (ui-avatars.com)
  const photoSrc = doctor.profilePhoto
    ? doctor.profilePhoto
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(doctor.fullName)}&background=1d4ed8&color=fff&size=128&bold=true`;

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden w-full max-w-sm">

      {/* ── Header gradient banner ──────────────────────────────────────────── */}
      <div className="relative h-28 bg-gradient-to-r from-primary-800 via-primary-600 to-primary-500">

        {/* Decorative circle pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white" />
          <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white" />
        </div>

        {/* Verified badge – only shown when isVerified === true */}
        {doctor.isVerified && (
          <span className="absolute top-3 right-3 flex items-center gap-1
                           bg-white/20 backdrop-blur-sm text-white text-xs font-semibold
                           px-2.5 py-1 rounded-full border border-white/30">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            PMDC Verified
          </span>
        )}
      </div>

      {/* ── Card body ──────────────────────────────────────────────────────── */}
      <div className="px-6 pb-6">

        {/* ── Avatar row: photo overlaps the banner ──────────────────────────── */}
        <div className="flex items-end justify-between -mt-12 mb-4">
          {/* Profile photo with availability dot */}
          <div className="relative">
            <img
              src={photoSrc}
              alt={`Dr. ${doctor.fullName}`}
              className="w-24 h-24 rounded-2xl object-cover border-4 border-white shadow-md"
            />
            {/* Green dot = available, Red dot = unavailable */}
            <span
              className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white
                          ${doctor.isAvailable ? 'bg-green-400' : 'bg-red-400'}`}
              title={doctor.isAvailable ? 'Currently available' : 'Currently unavailable'}
            />
          </div>

          {/* Availability toggle button – doctor's own profile only */}
          {showAvailabilityToggle && (
            <button
              onClick={handleToggleAvailability}
              disabled={toggling}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all
                ${doctor.isAvailable
                  ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                  : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'}
                ${toggling ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {toggling
                ? 'Updating...'
                : doctor.isAvailable
                  ? 'Set Unavailable'
                  : 'Set Available'}
            </button>
          )}
        </div>

        {/* ── Name + Badges ───────────────────────────────────────────────── */}
        <div className="mb-4">
          <h3 className="text-xl font-bold text-gray-900 leading-tight">
            Dr. {doctor.fullName}
          </h3>

          {/* Specialization + consultation type badges */}
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center bg-primary-50 text-primary-700 text-xs font-semibold px-3 py-1 rounded-full">
              {doctor.specialization}
            </span>
            <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full
              ${CONSULT_BADGE[doctor.consultationType] || 'bg-gray-100 text-gray-600'}`}>
              {CONSULT_LABEL[doctor.consultationType] || doctor.consultationType}
            </span>
          </div>
        </div>

        {/* ── Meta info grid ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-4">

          {/* City */}
          <div className="flex items-center gap-2 text-gray-600">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-medium">{doctor.city}</span>
          </div>

          {/* Years of experience */}
          <div className="flex items-center gap-2 text-gray-600">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium">{doctor.yearsOfExperience} yrs exp.</span>
          </div>

          {/* Availability label */}
          <div className="flex items-center gap-2 col-span-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${doctor.isAvailable ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className={`text-sm font-medium ${doctor.isAvailable ? 'text-green-700' : 'text-red-600'}`}>
              {doctor.isAvailable ? 'Available for appointments' : 'Not accepting appointments'}
            </span>
          </div>
        </div>

        {/* ── Divider ─────────────────────────────────────────────────────── */}
        <hr className="border-gray-100 mb-4" />

        {/* ── Rating row ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-4">
          <StarRating rating={doctor.rating} />
          <span className="text-sm font-bold text-gray-800">
            {doctor.rating > 0 ? doctor.rating.toFixed(1) : 'New'}
          </span>
          <span className="text-xs text-gray-400">
            ({doctor.totalReviews} {doctor.totalReviews === 1 ? 'review' : 'reviews'})
          </span>
        </div>

        {/* ── Wait time badge ──────────────────────────────────────────────── */}
        <div className="mb-4">
          <WaitTimeBadge waitHours={waitHours} nextAvailable={nextAvail} />
        </div>

        {/* ── 7-day availability ────────────────────────────────────────────── */}
        <div className="mb-4">
          <DoctorAvailabilityMini doctorId={doctor._id} />
        </div>

        {/* ── Fee ─────────────────────────────────────────────────────────── */}
        <div className="flex items-baseline gap-1.5 mb-4">
          <span className="text-2xl font-extrabold text-primary-700">
            PKR {doctor.hourlyFee.toLocaleString('en-PK')}
          </span>
          <span className="text-sm text-gray-400 font-medium">/consultation</span>
        </div>

        {/* ── Bio excerpt ─────────────────────────────────────────────────── */}
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 mb-6">
          {doctor.bio}
        </p>

        {/* ── Action buttons ──────────────────────────────────────────────── */}
        <div className="flex gap-2">
          <button
            onClick={() => openBooking(doctor)}
            className={`btn-primary flex-1 flex items-center justify-center gap-2
              ${!doctor.isAvailable ? 'opacity-60 cursor-not-allowed' : ''}`}
            disabled={!doctor.isAvailable}
            title={!doctor.isAvailable ? 'Doctor is currently unavailable' : ''}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {doctor.isAvailable ? 'Book' : 'Unavailable'}
          </button>

          {/* Chat with AI assistant (always available even when doctor is offline) */}
          <button
            onClick={() => setChatOpen(true)}
            className="btn-outline flex items-center justify-center gap-2 px-4"
            title="Chat with AI assistant"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Chat
          </button>
        </div>
      </div>

      {/* ── Alternative doctor suggestion ──────────────────────────────────── */}
      <AlternativeDoctorBanner alternatives={alternatives} currentWaitHours={waitHours} />

      {/* ChatWidget renders as a fixed overlay — position: fixed, bottom-right */}
      {chatOpen && (
        <ChatWidget doctor={doctor} onClose={() => setChatOpen(false)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DoctorSearchCard – MediShield AI
//
// Horizontal result card used in the search results grid.
// Top 3 ranked doctors (_rank ≤ 3) receive a gold "AI Recommended" badge.
//
// Layout (desktop): [Photo] [Name / Spec / City / Rating] [Fee / Availability / Book]
// Layout (mobile):  stacked vertically
//
// Props:
//   doctor  – matched doctor object with _rank and _score injected by matchDoctors()
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import ChatWidget from '../chat/ChatWidget';
import { useBooking } from '../../context/BookingContext';
import WaitTimeBadge from '../WaitTimeBadge';

// ── Star Rating ────────────────────────────────────────────────────────────────
function StarRating({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          className={`w-3.5 h-3.5 ${n <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-200'}`}
          fill="currentColor" viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

// ── Consultation type badge colours ───────────────────────────────────────────
const TYPE_STYLE = {
  Online:   'bg-emerald-100 text-emerald-700',
  Physical: 'bg-blue-100   text-blue-700',
  Both:     'bg-violet-100 text-violet-700',
};

// ── AI Recommended badge (gold gradient, rank 1–3) ────────────────────────────
function AIBadge({ rank, t }) {
  const isTop1 = rank === 1;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full
        ${isTop1
          ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-sm'
          : 'bg-gradient-to-r from-yellow-100 to-amber-100 text-amber-700 border border-amber-200'}`}
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd"
          d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
          clipRule="evenodd" />
      </svg>
      {t('ai.recommended')}
    </span>
  );
}

// ── Match score indicator ─────────────────────────────────────────────────────
function ScoreBar({ score }) {
  // Colour shifts from yellow → green as score rises
  const colour =
    score >= 70 ? 'bg-green-500' :
    score >= 45 ? 'bg-yellow-400' :
                  'bg-gray-300';

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-400">{score}%</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DoctorSearchCard({ doctor }) {
  const { t } = useLanguage();
  const { openBooking } = useBooking();
  const isTopThree = doctor._rank <= 3;
  const [chatOpen, setChatOpen] = useState(false);

  // Photo: use uploaded path or a generated avatar
  const photoSrc = doctor.profilePhoto
    ? doctor.profilePhoto
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(doctor.fullName)}&background=1d4ed8&color=fff&size=128&bold=true`;

  const consultLabel =
    doctor.consultationType === 'Both'     ? t('card.both') :
    doctor.consultationType === 'Online'   ? t('card.online') :
                                              t('card.physical');

  return (
    <article
      className={`bg-white rounded-2xl border transition-all duration-200
        hover:shadow-md hover:-translate-y-0.5
        ${isTopThree
          ? 'border-amber-200 shadow-sm ring-1 ring-amber-100'
          : 'border-gray-100 shadow-sm'}`}
    >
      {/* ── Top badge row (AI Recommended) ──────────────────────────────────── */}
      {isTopThree && (
        <div className="px-5 pt-3 pb-0 flex items-center justify-between">
          <AIBadge rank={doctor._rank} t={t} />
          <ScoreBar score={doctor._score} />
        </div>
      )}

      {/* ── Card body ─────────────────────────────────────────────────────── */}
      <div className={`flex flex-col sm:flex-row gap-4 p-5 ${isTopThree ? 'pt-3' : ''}`}>

        {/* Photo + availability dot */}
        <div className="relative flex-shrink-0 self-start">
          <img
            src={photoSrc}
            alt={`Dr. ${doctor.fullName}`}
            className="w-20 h-20 rounded-2xl object-cover border-2 border-gray-100"
          />
          {/* Availability dot overlay */}
          <span
            className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white
              ${doctor.isAvailable ? 'bg-green-400' : 'bg-red-400'}`}
            title={doctor.isAvailable ? t('card.available') : t('card.unavailable')}
          />
        </div>

        {/* Middle: core info */}
        <div className="flex-1 min-w-0">
          {/* Name + verified badge */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-base font-bold text-gray-900 truncate">
              Dr. {doctor.fullName}
            </h3>
            {doctor.isVerified && (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {t('card.verified')}
              </span>
            )}
          </div>

          {/* Specialization + consultation type badges */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className="text-xs font-semibold bg-primary-50 text-primary-700 px-2.5 py-1 rounded-full">
              {doctor.specialization}
            </span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_STYLE[doctor.consultationType] || 'bg-gray-100 text-gray-600'}`}>
              {consultLabel}
            </span>
          </div>

          {/* City + experience */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-2">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {doctor.city}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {doctor.yearsOfExperience} {t('card.experience')}
            </span>
          </div>

          {/* Rating row */}
          <div className="flex items-center gap-2">
            <StarRating rating={doctor.rating} />
            <span className="text-sm font-semibold text-gray-800">
              {doctor.rating > 0 ? doctor.rating.toFixed(1) : '–'}
            </span>
            <span className="text-xs text-gray-400">
              ({doctor.totalReviews} {t('card.reviews')})
            </span>
          </div>
        </div>

        {/* Right: fee + availability + book */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 sm:gap-2 sm:min-w-[130px]">
          {/* Fee */}
          <div className="text-right">
            <p className="text-xl font-extrabold text-primary-700 leading-tight">
              PKR {doctor.hourlyFee.toLocaleString('en-PK')}
            </p>
            <p className="text-xs text-gray-400">{t('card.perConsult')}</p>
          </div>

          {/* Wait time badge */}
          <WaitTimeBadge doctorId={doctor._id} />

          {/* Action buttons */}
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => openBooking(doctor)}
              disabled={!doctor.isAvailable}
              className={`btn-primary text-sm px-4 py-2.5 flex-1 sm:flex-none
                ${!doctor.isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {t('card.book')}
            </button>
            <button
              onClick={() => setChatOpen(true)}
              className="btn-outline text-sm px-4 py-2.5 flex items-center gap-1.5"
              title="Chat with AI assistant"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              Chat
            </button>
          </div>
        </div>
      </div>

      {/* ChatWidget: fixed overlay, bottom-right of viewport */}
      {chatOpen && (
        <ChatWidget doctor={doctor} onClose={() => setChatOpen(false)} />
      )}
    </article>
  );
}

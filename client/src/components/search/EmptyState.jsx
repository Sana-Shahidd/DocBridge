// ─────────────────────────────────────────────────────────────────────────────
// EmptyState – MediShield AI
//
// Shown when the filtered search returns zero results.
// Always surfaces the closest matching doctor across ALL doctors (ignoring
// filters) so users never leave the page empty-handed.
//
// Props:
//   query        – current search string
//   closestMatch – doctor returned by findClosestMatch() or null
//   onClearFilters – callback to reset all filters
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import DoctorSearchCard from './DoctorSearchCard';

// ── Illustration: stethoscope SVG ─────────────────────────────────────────────
function EmptyIllustration() {
  return (
    <svg
      className="w-24 h-24 text-gray-200"
      fill="none" viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Stethoscope body */}
      <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="3" />
      <path
        d="M32 30 C32 30 28 45 28 55 C28 65 36 72 46 72 C56 72 62 65 62 55 L62 45"
        stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none"
      />
      <circle cx="62" cy="38" r="8" stroke="currentColor" strokeWidth="4" fill="none" />
      <circle cx="62" cy="38" r="3" fill="currentColor" />
      {/* Question mark in centre */}
      <text x="42" y="56" fontSize="18" fontWeight="bold" fill="currentColor" opacity="0.4">?</text>
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function EmptyState({ query, closestMatch, onClearFilters }) {
  const { t } = useLanguage();

  return (
    <div className="py-8">
      {/* ── No results message ────────────────────────────────────────────── */}
      <div className="flex flex-col items-center text-center mb-10">
        <EmptyIllustration />

        <h3 className="mt-5 text-xl font-bold text-gray-800">{t('empty.title')}</h3>
        <p className="mt-1 text-sm text-gray-500 max-w-xs">{t('empty.subtitle')}</p>

        {/* Suggestions based on query */}
        {query && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {['fever', 'headache', 'skin rash', 'diabetes'].map((hint) => (
              <span
                key={hint}
                className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full cursor-default"
              >
                Try: {hint}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={onClearFilters}
          className="mt-5 btn-outline text-sm px-6 py-2.5"
        >
          {t('empty.tryAgain')}
        </button>
      </div>

      {/* ── Closest match card ────────────────────────────────────────────── */}
      {closestMatch && (
        <div>
          {/* Divider with label */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex-1 h-px bg-gray-200" />
            <div className="flex items-center gap-2 px-1">
              <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-sm font-bold text-primary-700 whitespace-nowrap">
                {t('empty.nearestTitle')}
              </span>
            </div>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <p className="text-xs text-gray-400 text-center mb-4">{t('empty.nearestSub')}</p>

          {/* Show the closest doctor using the same card component */}
          <DoctorSearchCard doctor={{ ...closestMatch, _rank: 1, _score: closestMatch._score ?? 0 }} />
        </div>
      )}
    </div>
  );
}

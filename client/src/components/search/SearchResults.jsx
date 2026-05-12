// ─────────────────────────────────────────────────────────────────────────────
// SearchResults – MediShield AI
//
// Renders the list of matched doctors returned by matchDoctors().
// Shows a results count, loading skeleton, and an error state.
// The first 3 cards get the gold AI Recommended badge (handled in DoctorSearchCard).
//
// Props:
//   results  – array of scored doctor objects
//   query    – current search string (for the "results for X" label)
//   loading  – show skeleton while fetching from API
//   error    – error string if API call failed
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import DoctorSearchCard from './DoctorSearchCard';
import { useLanguage } from '../../i18n/LanguageContext';

// ── Loading skeleton card ─────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
      <div className="flex gap-4">
        <div className="w-20 h-20 rounded-2xl bg-gray-200 flex-shrink-0" />
        <div className="flex-1 space-y-2.5">
          <div className="h-4 bg-gray-200 rounded-full w-3/5" />
          <div className="h-3 bg-gray-200 rounded-full w-2/5" />
          <div className="h-3 bg-gray-200 rounded-full w-1/2" />
          <div className="flex gap-2 mt-1">
            <div className="h-3 bg-gray-200 rounded-full w-16" />
            <div className="h-3 bg-gray-200 rounded-full w-20" />
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-2 w-32">
          <div className="h-6 bg-gray-200 rounded-full w-full" />
          <div className="h-8 bg-gray-200 rounded-xl w-24 mt-2" />
        </div>
      </div>
    </div>
  );
}

// ── Error state ────────────────────────────────────────────────────────────────
function ErrorState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-red-600">{message}</p>
      <p className="text-xs text-gray-400 mt-1">Make sure the backend server is running on port 5000.</p>
    </div>
  );
}

// ── Results count header ───────────────────────────────────────────────────────
function ResultsHeader({ count, query, t }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <p className="text-sm font-medium text-gray-600">
        {t('results.showing')}{' '}
        <span className="font-bold text-gray-900">{count}</span>{' '}
        {t('results.doctors')}
        {query && (
          <> {t('results.for')} <span className="text-primary-700 font-semibold">"{query}"</span></>
        )}
      </p>

      {/* Sort indicator (decorative – results are always sorted by AI score) */}
      <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
        <svg className="w-3.5 h-3.5 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd"
            d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
            clipRule="evenodd" />
        </svg>
        {t('results.sortBy')}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SearchResults({ results, query, loading, error }) {
  const { t } = useLanguage();

  // Loading state
  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-5 text-sm text-primary-600">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t('results.loading')}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((n) => <SkeletonCard key={n} />)}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return <ErrorState message={t('results.fetchError')} />;
  }

  // Results list
  return (
    <div>
      {results.length > 0 && (
        <ResultsHeader count={results.length} query={query} t={t} />
      )}

      <div className="space-y-3">
        {results.map((doctor) => (
          <DoctorSearchCard key={doctor._id} doctor={doctor} />
        ))}
      </div>
    </div>
  );
}

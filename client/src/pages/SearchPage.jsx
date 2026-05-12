// ─────────────────────────────────────────────────────────────────────────────
// SearchPage – MediShield AI
//
// Main doctor search page. Owns all search/filter state and orchestrates:
//   • Fetching all doctors from the API on mount (once)
//   • Running the AI matching algorithm client-side on every query/filter change
//   • Passing results to SearchResults or EmptyState
//
// State flow:
//   user types → query state → debounced → matchDoctors() → results state
//   filter change → same matchDoctors() call (no debounce needed)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { matchDoctors, findClosestMatch } from '../utils/matchDoctors';
import { getAllDoctors } from '../api/doctorApi';

import SearchBar    from '../components/search/SearchBar';
import FilterSidebar from '../components/search/FilterSidebar';
import SearchResults from '../components/search/SearchResults';
import EmptyState   from '../components/search/EmptyState';

// ── Default filter values ────────────────────────────────────────────────────
const DEFAULT_FILTERS = {
  city:             'all',
  consultationType: 'all',
  feeRange:         [0, 10000],
  availableOnly:    false,
};

// ── Quick-search pill (pre-fills the search bar) ──────────────────────────────
function QuickPill({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(label)}
      className="text-xs font-medium bg-white border border-gray-200 text-gray-600
                 px-3 py-1.5 rounded-full hover:border-primary-300 hover:text-primary-700
                 transition-all duration-150 shadow-sm"
    >
      {label}
    </button>
  );
}

// ── Mobile filter drawer toggle ────────────────────────────────────────────────
function MobileFilterToggle({ isOpen, onToggle, hasActiveFilters }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold
        transition-all duration-150
        ${hasActiveFilters
          ? 'border-primary-500 bg-primary-50 text-primary-700'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
      </svg>
      Filters
      {hasActiveFilters && (
        <span className="w-2 h-2 rounded-full bg-primary-500" />
      )}
      <svg
        className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SearchPage({ initialQuery = '' }) {
  const { t, lang, toggleLang } = useLanguage();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [query,          setQuery]          = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  // Sync when a new specialization is injected from SymptomChecker
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      setDebouncedQuery(initialQuery);
    }
  }, [initialQuery]);
  const [filters,        setFilters]        = useState(DEFAULT_FILTERS);

  // ── Data state ─────────────────────────────────────────────────────────────
  const [allDoctors, setAllDoctors] = useState([]);
  const [results,    setResults]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // ── Fetch all doctors once on mount ────────────────────────────────────────
  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getAllDoctors();
        setAllDoctors(data.doctors ?? []);
      } catch {
        setError('fetch-failed');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  // ── Re-run matching whenever debouncedQuery or filters change ──────────────
  useEffect(() => {
    if (loading) return;
    const matched = matchDoctors(allDoctors, debouncedQuery, filters);
    setResults(matched);
  }, [debouncedQuery, filters, allDoctors, loading]);

  // ── Stable callback: receives debounced value from SearchBar ───────────────
  const handleDebouncedQuery = useCallback((val) => {
    setDebouncedQuery(val);
  }, []);

  // ── Filter helpers ─────────────────────────────────────────────────────────
  const handleFilterChange = useCallback((updated) => setFilters(updated), []);

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  const hasActiveFilters =
    filters.city !== 'all' ||
    filters.consultationType !== 'all' ||
    filters.feeRange[0] !== 0 ||
    filters.feeRange[1] !== 10000 ||
    filters.availableOnly;

  // ── Quick-search pills ─────────────────────────────────────────────────────
  const quickPills = [
    'chest pain', 'headache', 'skin rash', 'diabetes',
    'back pain', 'fever', 'eye pain', 'pregnancy',
  ];

  // Closest match for empty state (computed only when results = 0)
  const closestMatch =
    !loading && results.length === 0 && allDoctors.length > 0
      ? findClosestMatch(allDoctors, debouncedQuery)
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-primary-50">

      {/* ════════════════════════════════════════════════════════════════════
          HERO SECTION
      ════════════════════════════════════════════════════════════════════ */}
      <section className="bg-gradient-to-r from-primary-800 via-primary-700 to-primary-500 text-white py-12 px-4 relative overflow-hidden">

        {/* Decorative circles */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white opacity-5" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-white opacity-5" />
        </div>

        <div className="max-w-4xl mx-auto relative">
          {/* AI badge */}
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/20
                           text-white text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd"
                d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                clipRule="evenodd" />
            </svg>
            {t('hero.badge')}

            {/* Language toggle */}
            <button
              onClick={toggleLang}
              className="ml-2 bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-full text-xs font-bold transition-colors"
            >
              {t('nav.langSwitch')}
            </button>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold mb-2 leading-tight">
            {t('hero.title')}
          </h1>
          <p className="text-primary-100 text-base mb-7 max-w-xl">
            {t('hero.subtitle')}
          </p>

          {/* ── Search bar ─────────────────────────────────────────────────── */}
          <SearchBar
            value={query}
            onChange={setQuery}
            onDebounced={handleDebouncedQuery}
          />

          {/* ── Quick-search pills ────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 mt-4">
            {quickPills.map((pill) => (
              <QuickPill
                key={pill}
                label={pill}
                onClick={(val) => {
                  setQuery(val);
                  setDebouncedQuery(val);
                }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          CONTENT: Sidebar + Results
      ════════════════════════════════════════════════════════════════════ */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Mobile: filter toggle button */}
        <div className="flex items-center justify-between mb-5 lg:hidden">
          <p className="text-sm font-medium text-gray-600">
            {!loading && (
              <>
                <span className="font-bold text-gray-900">{results.length}</span> {t('results.doctors')}
              </>
            )}
          </p>
          <MobileFilterToggle
            isOpen={mobileFiltersOpen}
            onToggle={() => setMobileFiltersOpen((o) => !o)}
            hasActiveFilters={hasActiveFilters}
          />
        </div>

        {/* Mobile filter drawer */}
        {mobileFiltersOpen && (
          <div className="lg:hidden mb-5">
            <FilterSidebar filters={filters} onChange={handleFilterChange} />
          </div>
        )}

        {/* Two-column layout on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* ── Sidebar (hidden on mobile, shown inline) ────────────────────── */}
          <div className="hidden lg:block lg:col-span-1">
            <FilterSidebar filters={filters} onChange={handleFilterChange} />
          </div>

          {/* ── Results column ────────────────────────────────────────────── */}
          <div className="lg:col-span-3">

            {/* Show results OR empty state */}
            {!loading && !error && results.length === 0 ? (
              <EmptyState
                query={debouncedQuery}
                closestMatch={closestMatch}
                onClearFilters={clearFilters}
              />
            ) : (
              <SearchResults
                results={results}
                query={debouncedQuery}
                loading={loading}
                error={error}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SearchBar – MediShield AI
//
// Debounced search input with autocomplete dropdown.
// As the user types, it queries the SYMPTOM_MAP and surfaces:
//   1. Matching symptom strings  (e.g. "chest pain", "back pain")
//   2. The implied specializations for each symptom
//
// Props:
//   value      – current search string (controlled)
//   onChange   – called with new string on every keystroke
//   onDebounced – called with the debounced value (300 ms delay)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { getSymptomSuggestions, getSuggestedSpecializations } from '../../utils/matchDoctors';

// ── Debounce hook ─────────────────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ── Specialization pill in the dropdown ───────────────────────────────────────
function SpecPill({ spec }) {
  return (
    <span className="inline-flex items-center bg-primary-100 text-primary-700 text-xs font-medium px-2 py-0.5 rounded-full">
      {spec}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SearchBar({ value, onChange, onDebounced }) {
  const { t, isUrdu } = useLanguage();

  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex]   = useState(-1); // keyboard navigation

  const inputRef    = useRef(null);
  const dropdownRef = useRef(null);

  // Debounce the query before passing it to the parent (triggers API search)
  const debounced = useDebounce(value, 300);
  useEffect(() => {
    onDebounced?.(debounced);
  }, [debounced, onDebounced]);

  // Build suggestion list from the symptom map
  const suggestions = getSymptomSuggestions(value);

  // Open dropdown when there are suggestions and input has focus
  const handleFocus = () => {
    if (suggestions.length > 0) setShowDropdown(true);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current    && !inputRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Re-evaluate dropdown visibility whenever suggestions change
  useEffect(() => {
    if (suggestions.length > 0 && document.activeElement === inputRef.current) {
      setShowDropdown(true);
    } else if (suggestions.length === 0) {
      setShowDropdown(false);
    }
    setActiveIndex(-1);
  }, [suggestions.length]);

  // ── Keyboard navigation inside dropdown ────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      if (!showDropdown || !suggestions.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    },
    [showDropdown, suggestions, activeIndex]
  );

  // ── Select a suggestion from the dropdown ──────────────────────────────────
  const selectSuggestion = (symptom) => {
    onChange(symptom);        // Fill the input
    setShowDropdown(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  // ── Clear button ───────────────────────────────────────────────────────────
  const handleClear = () => {
    onChange('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      {/* ── Input wrapper ─────────────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-3 bg-white border-2 rounded-2xl px-4 py-3 shadow-sm transition-all duration-200
          ${showDropdown ? 'border-primary-400 ring-4 ring-primary-100' : 'border-gray-200 hover:border-gray-300'}`}
      >
        {/* Search icon */}
        <svg className="w-5 h-5 text-primary-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder')}
          className={`flex-1 bg-transparent text-gray-900 placeholder-gray-400 text-base focus:outline-none
            ${isUrdu ? 'text-right font-urdu' : ''}`}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('search.placeholder')}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />

        {/* Clear button – only shown when there's a query */}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
            aria-label={t('search.clearSearch')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* AI sparkle indicator */}
        <div className="flex-shrink-0 flex items-center gap-1 text-primary-400 opacity-60">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
              clipRule="evenodd" />
          </svg>
        </div>
      </div>

      {/* ── Autocomplete Dropdown ─────────────────────────────────────────── */}
      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200
                     rounded-2xl shadow-xl z-50 overflow-hidden"
          role="listbox"
          aria-label={t('search.suggestLabel')}
        >
          {/* Header */}
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd"
                d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                clipRule="evenodd" />
            </svg>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('search.suggestLabel')}
            </span>
          </div>

          {/* Suggestion rows */}
          <ul className="py-1 max-h-72 overflow-y-auto">
            {suggestions.map((symptom, idx) => {
              const specs = getSuggestedSpecializations(symptom).slice(0, 2);
              const isActive = idx === activeIndex;

              return (
                <li
                  key={symptom}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => selectSuggestion(symptom)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors
                    ${isActive ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
                >
                  {/* Left: symptom icon + text */}
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                      ${isActive ? 'bg-primary-100' : 'bg-gray-100'}`}>
                      <svg className={`w-4 h-4 ${isActive ? 'text-primary-600' : 'text-gray-400'}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <div>
                      {/* Highlight the matching portion */}
                      <span className="text-sm font-medium text-gray-900 capitalize">{symptom}</span>
                    </div>
                  </div>

                  {/* Right: specialization pills */}
                  {specs.length > 0 && (
                    <div className="flex gap-1 flex-wrap justify-end max-w-[55%]">
                      {specs.map((s) => <SpecPill key={s} spec={s} />)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Footer hint */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              ↑↓ to navigate · Enter to select · Esc to close
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

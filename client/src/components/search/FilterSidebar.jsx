// ─────────────────────────────────────────────────────────────────────────────
// FilterSidebar – MediShield AI
//
// Sticky sidebar with four filter controls:
//   1. City dropdown       (18 Pakistani cities + All Cities)
//   2. Consultation type   (All / Online / Physical)
//   3. Fee range slider    (dual-handle, 0–10 000 PKR)
//   4. Available Now Only  (boolean toggle)
//
// Props:
//   filters  – current filter state object
//   onChange – (updatedFilters) callback
// ─────────────────────────────────────────────────────────────────────────────
import React, { useRef, useCallback } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

// ── Statics ───────────────────────────────────────────────────────────────────
const CITIES = [
  'Karachi', 'Lahore', 'Islamabad', 'Peshawar', 'Quetta', 'Multan',
  'Faisalabad', 'Rawalpindi', 'Hyderabad', 'Sialkot', 'Gujranwala',
  'Bahawalpur', 'Sargodha', 'Abbottabad', 'Sukkur', 'Larkana',
  'Dera Ghazi Khan', 'Mardan',
];

const FEE_MIN = 0;
const FEE_MAX = 10000;
const FEE_STEP = 100;

// ── Dual-handle Range Slider ──────────────────────────────────────────────────
// Two overlapping <input type="range"> elements share the same track.
// CSS on the thumb is injected via index.css (.range-thumb).
function DualRangeSlider({ value, onChange }) {
  const [minVal, maxVal] = value;
  const trackRef = useRef(null);

  // Percentages for the coloured "active" portion of the track
  const minPct = ((minVal - FEE_MIN) / (FEE_MAX - FEE_MIN)) * 100;
  const maxPct = ((maxVal - FEE_MIN) / (FEE_MAX - FEE_MIN)) * 100;

  const handleMin = useCallback(
    (e) => {
      const val = Math.min(Number(e.target.value), maxVal - FEE_STEP);
      onChange([val, maxVal]);
    },
    [maxVal, onChange]
  );

  const handleMax = useCallback(
    (e) => {
      const val = Math.max(Number(e.target.value), minVal + FEE_STEP);
      onChange([minVal, val]);
    },
    [minVal, onChange]
  );

  return (
    <div className="mt-1">
      {/* Dual-value display */}
      <div className="flex items-center justify-between mb-3 text-sm font-semibold text-primary-700">
        <span>PKR {minVal.toLocaleString('en-PK')}</span>
        <span>PKR {maxVal.toLocaleString('en-PK')}</span>
      </div>

      {/* Slider container */}
      <div className="relative h-6 flex items-center" ref={trackRef}>
        {/* Track background */}
        <div className="absolute left-0 right-0 h-2 bg-gray-200 rounded-full pointer-events-none" />

        {/* Active range fill */}
        <div
          className="absolute h-2 bg-primary-500 rounded-full pointer-events-none"
          style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }}
        />

        {/* Min handle */}
        <input
          type="range"
          min={FEE_MIN} max={FEE_MAX} step={FEE_STEP}
          value={minVal}
          onChange={handleMin}
          className="range-thumb absolute w-full h-2 appearance-none bg-transparent cursor-pointer"
          style={{ zIndex: minVal > FEE_MAX - (FEE_MAX - FEE_MIN) * 0.05 ? 5 : 3 }}
          aria-label="Minimum fee"
        />

        {/* Max handle */}
        <input
          type="range"
          min={FEE_MIN} max={FEE_MAX} step={FEE_STEP}
          value={maxVal}
          onChange={handleMax}
          className="range-thumb absolute w-full h-2 appearance-none bg-transparent cursor-pointer"
          style={{ zIndex: 4 }}
          aria-label="Maximum fee"
        />
      </div>

      {/* Axis labels */}
      <div className="flex justify-between text-xs text-gray-400 mt-2">
        <span>PKR 0</span>
        <span>PKR 10,000</span>
      </div>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function FilterSection({ title, children }) {
  return (
    <div className="pb-5 border-b border-gray-100 last:border-0 last:pb-0">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">{title}</h4>
      {children}
    </div>
  );
}

// ── Consultation type pill group ──────────────────────────────────────────────
function TypePill({ label, value, current, onClick }) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`flex-1 py-2 text-sm font-semibold rounded-xl border transition-all duration-150
        ${active
          ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
          : 'bg-white border-gray-200 text-gray-600 hover:border-primary-300 hover:text-primary-700'}`}
    >
      {label}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function FilterSidebar({ filters, onChange }) {
  const { t } = useLanguage();

  // ── Helpers ──────────────────────────────────────────────────────────────
  const set = (key, val) => onChange({ ...filters, [key]: val });

  const isActive =
    filters.city !== 'all' ||
    filters.consultationType !== 'all' ||
    filters.feeRange[0] !== FEE_MIN ||
    filters.feeRange[1] !== FEE_MAX ||
    filters.availableOnly;

  const clearAll = () =>
    onChange({
      city: 'all',
      consultationType: 'all',
      feeRange: [FEE_MIN, FEE_MAX],
      availableOnly: false,
    });

  return (
    <aside className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sticky top-20 space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          <h3 className="font-bold text-gray-900 text-sm">{t('filters.title')}</h3>
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
          )}
        </div>

        {isActive && (
          <button
            onClick={clearAll}
            className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
          >
            {t('filters.clearFilters')}
          </button>
        )}
      </div>

      {/* ── 1. City ─────────────────────────────────────────────────────────── */}
      <FilterSection title={t('filters.city')}>
        <div className="relative">
          <select
            value={filters.city}
            onChange={(e) => set('city', e.target.value)}
            className="w-full form-input pr-8 appearance-none text-sm"
          >
            <option value="all">{t('filters.allCities')}</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {/* Chevron */}
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </FilterSection>

      {/* ── 2. Consultation type ─────────────────────────────────────────────── */}
      <FilterSection title={t('filters.type')}>
        <div className="flex gap-2">
          <TypePill label={t('filters.typeAll')}      value="all"      current={filters.consultationType} onClick={(v) => set('consultationType', v)} />
          <TypePill label={t('filters.typeOnline')}   value="Online"   current={filters.consultationType} onClick={(v) => set('consultationType', v)} />
          <TypePill label={t('filters.typePhysical')} value="Physical" current={filters.consultationType} onClick={(v) => set('consultationType', v)} />
        </div>
      </FilterSection>

      {/* ── 3. Fee range ─────────────────────────────────────────────────────── */}
      <FilterSection title={t('filters.feeRange')}>
        <DualRangeSlider
          value={filters.feeRange}
          onChange={(range) => set('feeRange', range)}
        />
      </FilterSection>

      {/* ── 4. Available now ─────────────────────────────────────────────────── */}
      <FilterSection title="">
        <label className="flex items-center justify-between gap-3 cursor-pointer group">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${filters.availableOnly ? 'bg-green-400' : 'bg-gray-300'}`} />
            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
              {t('filters.availableOnly')}
            </span>
          </div>
          {/* Toggle switch */}
          <div
            onClick={() => set('availableOnly', !filters.availableOnly)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0
              ${filters.availableOnly ? 'bg-primary-600' : 'bg-gray-300'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
                ${filters.availableOnly ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </div>
        </label>
      </FilterSection>
    </aside>
  );
}

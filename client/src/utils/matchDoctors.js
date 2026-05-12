// ─────────────────────────────────────────────────────────────────────────────
// AI Doctor Matching Algorithm – MediShield AI
//
// Composite scoring formula (out of 100):
//   40% – Keyword match  (query ↔ specialization via symptom map, name, bio)
//   30% – Availability   (isAvailable === true → full points)
//   20% – Rating score   (doctor.rating / 5 × 100)
//   10% – Fee preference (lower fee within selected range → higher score)
//
// Hard filters (city, consultationType, feeRange, availableOnly) are applied
// BEFORE scoring so unqualified doctors never appear in results.
// ─────────────────────────────────────────────────────────────────────────────
import { SYMPTOM_MAP } from '../data/symptomMap';

// ── Autocomplete helpers ──────────────────────────────────────────────────────

/**
 * Returns symptom strings from SYMPTOM_MAP that start with or contain `query`.
 * Used to populate the search dropdown suggestions.
 */
export function getSymptomSuggestions(query) {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase().trim();

  return Object.keys(SYMPTOM_MAP)
    .filter((symptom) => {
      // Match if the symptom starts with the query or any symptom word starts with it
      return (
        symptom.startsWith(q) ||
        symptom.includes(q) ||
        symptom.split(' ').some((word) => word.startsWith(q))
      );
    })
    .sort((a, b) => {
      // Prefer exact-start matches
      const aStarts = a.startsWith(q);
      const bStarts = b.startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.localeCompare(b);
    })
    .slice(0, 7); // Cap at 7 suggestions for a clean dropdown
}

/**
 * Returns the specializations implied by a search query.
 * Used to boost doctors whose specialization matches the symptom.
 */
export function getSuggestedSpecializations(query) {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase().trim();
  const matched = new Set();

  Object.entries(SYMPTOM_MAP).forEach(([symptom, specs]) => {
    if (
      symptom.includes(q) ||
      q.includes(symptom) ||
      symptom.split(' ').some((w) => w.startsWith(q))
    ) {
      specs.forEach((s) => matched.add(s));
    }
  });

  return [...matched];
}

// ── Individual scoring components ─────────────────────────────────────────────

/**
 * Keyword match score (0–100).
 * Checks query against symptom map → specialization, specialization text,
 * doctor name, bio, and city.
 */
function calcKeywordScore(doctor, query) {
  // No query → neutral score so all doctors appear equally
  if (!query || !query.trim()) return 50;

  const q = query.toLowerCase().trim();
  let score = 0;

  // ── Symptom map route (strongest signal) ──────────────────────────────────
  const impliedSpecs = getSuggestedSpecializations(q).map((s) => s.toLowerCase());
  const docSpec = doctor.specialization.toLowerCase();

  if (impliedSpecs.some((s) => docSpec.includes(s) || s.includes(docSpec))) {
    score += 55;
  }

  // ── Direct text matches ────────────────────────────────────────────────────
  if (docSpec.includes(q))                                   score += 30; // specialization
  if (doctor.fullName.toLowerCase().includes(q))             score += 20; // name
  if (doctor.bio && doctor.bio.toLowerCase().includes(q))    score += 10; // bio
  if (doctor.city.toLowerCase().includes(q))                 score +=  5; // city

  return Math.min(score, 100);
}

/**
 * Fee preference score (0–100).
 * Within the selected range, lower fee → higher score.
 * Doctors outside the range return 0 (they are filtered out anyway).
 */
function calcFeeScore(doctorFee, feeRange) {
  const [min, max] = feeRange;
  if (doctorFee < min || doctorFee > max) return 0;
  if (max === min) return 100;
  return Math.round(100 - ((doctorFee - min) / (max - min)) * 100);
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * matchDoctors(doctors, query, filters) → scored doctor array (max 20)
 *
 * Each returned doctor has two extra properties:
 *   _score  – composite score 0–100 (used for sorting)
 *   _rank   – 1-based position in results (top 3 get "AI Recommended" badge)
 */
export function matchDoctors(doctors, query, filters) {
  const { city, consultationType, feeRange, availableOnly } = filters;

  // ── Step 1: Hard filters ────────────────────────────────────────────────────
  const filtered = doctors.filter((doc) => {
    // City filter
    if (city && city !== 'all' && doc.city !== city) return false;

    // Consultation type filter
    // A doctor offering "Both" always passes regardless of the selected type
    if (consultationType && consultationType !== 'all') {
      if (doc.consultationType !== 'Both' && doc.consultationType !== consultationType)
        return false;
    }

    // Availability filter
    if (availableOnly && !doc.isAvailable) return false;

    // Fee range filter
    if (doc.hourlyFee < feeRange[0] || doc.hourlyFee > feeRange[1]) return false;

    return true;
  });

  // ── Step 2: Score ───────────────────────────────────────────────────────────
  const scored = filtered.map((doc) => {
    const kwScore      = calcKeywordScore(doc, query);          // 0–100  (40%)
    const availScore   = doc.isAvailable ? 100 : 0;            // 0/100  (30%)
    const ratingScore  = (doc.rating / 5) * 100;               // 0–100  (20%)
    const feeScore     = calcFeeScore(doc.hourlyFee, feeRange); // 0–100  (10%)

    const composite =
      kwScore     * 0.40 +
      availScore  * 0.30 +
      ratingScore * 0.20 +
      feeScore    * 0.10;

    return {
      ...doc,
      _score:   Math.round(composite * 10) / 10, // Round to 1 decimal
      _kwScore: kwScore,
    };
  });

  // ── Step 3: Sort + slice + rank ─────────────────────────────────────────────
  scored.sort((a, b) => b._score - a._score);

  return scored.slice(0, 20).map((doc, idx) => ({ ...doc, _rank: idx + 1 }));
}

/**
 * findClosestMatch(allDoctors, query) → single best-matching doctor
 *
 * Called when the filtered results are empty. Ignores hard filters and returns
 * the most relevant available doctor so users always see *something* useful.
 */
export function findClosestMatch(allDoctors, query) {
  if (!allDoctors.length) return null;

  // Prefer available doctors; fall back to unavailable if none are available
  const pool = allDoctors.some((d) => d.isAvailable)
    ? allDoctors.filter((d) => d.isAvailable)
    : allDoctors;

  const scored = pool.map((doc) => ({
    ...doc,
    // Weighted blend: keyword match matters most, then rating
    _score: calcKeywordScore(doc, query) * 0.65 + ((doc.rating / 5) * 100) * 0.35,
    _rank: 1,
  }));

  scored.sort((a, b) => b._score - a._score);
  return scored[0] ?? null;
}

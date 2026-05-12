const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Module-level cache: doctorId → { data, ts }
const _cache = new Map();
const TTL_MS = 5 * 60 * 1000;

export async function getNextAvailable(doctorId) {
  const hit = _cache.get(doctorId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.data;
  const res  = await fetch(`${BASE}/api/doctors/${doctorId}/next-available`);
  const data = await res.json();
  if (data.success) _cache.set(doctorId, { data, ts: Date.now() });
  return data;
}

export function invalidateCache(doctorId) {
  _cache.delete(doctorId);
}

export async function getAvailabilitySummary() {
  const res = await fetch(`${BASE}/api/doctors/availability-summary`);
  return res.json();
}

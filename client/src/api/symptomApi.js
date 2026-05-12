const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function analyzeSymptoms({ symptoms, language = 'en' }) {
  const res = await fetch(`${BASE}/api/analyze-symptoms`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ symptoms, language }),
  });
  return res.json();
}

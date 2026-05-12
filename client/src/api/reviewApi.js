const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function submitReview({ appointmentId, ratings, feedback }) {
  const res = await fetch(`${BASE}/api/reviews`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ appointmentId, ratings, feedback }),
  });
  return res.json();
}

export async function getReviews({ doctorId, appointmentId } = {}) {
  const params = new URLSearchParams();
  if (doctorId)      params.set('doctorId', doctorId);
  if (appointmentId) params.set('appointmentId', appointmentId);
  const res = await fetch(`${BASE}/api/reviews?${params}`);
  return res.json();
}

export async function addFollowupNote(appointmentId, { note, returnInDays }) {
  const res = await fetch(`${BASE}/api/appointments/${appointmentId}/followup-note`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ note, returnInDays }),
  });
  return res.json();
}

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Availability ──────────────────────────────────────────────────────────────

export async function getAvailability(doctorId, { startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate)   params.set('endDate', endDate);
  const res = await fetch(`${BASE}/api/doctors/${doctorId}/availability?${params}`);
  return res.json();
}

export async function getAvailabilityForDate(doctorId, date) {
  const res = await fetch(`${BASE}/api/doctors/${doctorId}/availability/${date}`);
  return res.json();
}

export async function setAvailability(doctorId, { date, slots }) {
  const res = await fetch(`${BASE}/api/doctors/${doctorId}/availability`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ date, slots }),
  });
  return res.json();
}

// ── Appointments ──────────────────────────────────────────────────────────────

export async function createAppointment(payload) {
  const res = await fetch(`${BASE}/api/appointments`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  return res.json();
}

export async function getAppointmentsByPhone(patientPhone) {
  const res = await fetch(`${BASE}/api/appointments?patientPhone=${encodeURIComponent(patientPhone)}`);
  return res.json();
}

export async function getDoctorAppointments(doctorId, date) {
  const params = new URLSearchParams({ doctorId });
  if (date) params.set('date', date);
  const res = await fetch(`${BASE}/api/appointments?${params}`);
  return res.json();
}

export async function cancelAppointment(id, reason = '') {
  const res = await fetch(`${BASE}/api/appointments/${id}/cancel`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ reason }),
  });
  return res.json();
}

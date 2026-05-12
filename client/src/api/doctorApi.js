// ─────────────────────────────────────────────────────────────────────────────
// Doctor API helpers – MediShield AI
// Thin wrappers around axios calls. All paths resolve through the Vite proxy,
// so no hardcoded backend URL is needed in production builds either.
// ─────────────────────────────────────────────────────────────────────────────
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';
const BASE = `${API}/api/doctors`;

// ── Register a new doctor ─────────────────────────────────────────────────────
// `formData` must be a FormData instance (multipart/form-data) because it may
// include a profile photo binary alongside text fields.
export const registerDoctor = async (formData) => {
  const { data } = await axios.post(`${BASE}/register`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data; // { success, message, doctor }
};

// ── Fetch a single doctor by MongoDB _id ─────────────────────────────────────
export const getDoctorById = async (id) => {
  const { data } = await axios.get(`${BASE}/${id}`);
  return data; // { success, doctor }
};

// ── Toggle / set a doctor's availability ─────────────────────────────────────
export const updateAvailability = async (id, isAvailable) => {
  const { data } = await axios.put(`${BASE}/${id}/availability`, { isAvailable });
  return data; // { success, message, doctor }
};

// ── Fetch all doctors (used by the demo listing) ──────────────────────────────
export const getAllDoctors = async () => {
  const { data } = await axios.get(BASE);
  return data; // { success, count, doctors }
};

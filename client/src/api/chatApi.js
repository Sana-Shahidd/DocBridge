// ─────────────────────────────────────────────────────────────────────────────
// Chat API helpers – MediShield AI
// Thin axios wrappers for the /api/chatlog endpoints.
// ─────────────────────────────────────────────────────────────────────────────
import axios from 'axios';

const BASE = '/api/chatlog';

// Save a completed patient conversation; returns { success, referenceNumber }
export const saveChatLog = async (payload) => {
  const { data } = await axios.post(BASE, payload);
  return data;
};

// Fetch all logs; optionally filter by doctorId and/or status
export const getChatLogs = async ({ doctorId, status } = {}) => {
  const params = {};
  if (doctorId) params.doctorId = doctorId;
  if (status)   params.status   = status;
  const { data } = await axios.get(BASE, { params });
  return data; // { success, count, pending, logs }
};

// Toggle a log's status between 'pending' and 'contacted'
export const updateLogStatus = async (id, status) => {
  const { data } = await axios.patch(`${BASE}/${id}/status`, { status });
  return data; // { success, log }
};

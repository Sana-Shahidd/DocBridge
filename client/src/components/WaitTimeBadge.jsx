import { useState, useEffect } from 'react';
import { getNextAvailable } from '../api/waitTimeApi';
import { formatSlot } from '../utils/timeSlots';

// Parse ISO string and extract local time formatted for display
function extractTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const h = d.getUTCHours() + 5; // UTC → PKT (+5)
  const hFinal = h % 24;
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return formatSlot(`${String(hFinal).padStart(2, '0')}:${m}`);
}

// Accept either pre-fetched data or a doctorId to fetch lazily
export default function WaitTimeBadge({ doctorId, waitHours: propWaitHours, nextAvailable: propNext }) {
  const [waitHours,     setWaitHours]     = useState(propWaitHours ?? null);
  const [nextAvailable, setNextAvailable] = useState(propNext ?? null);
  const [loading,       setLoading]       = useState(propWaitHours === undefined);

  useEffect(() => {
    if (propWaitHours !== undefined || !doctorId) return;
    setLoading(true);
    getNextAvailable(doctorId)
      .then((r) => {
        if (r.success) {
          setWaitHours(r.waitHours);
          setNextAvailable(r.nextAvailable);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [doctorId, propWaitHours]);

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-400 animate-pulse">
        <span className="w-2 h-2 rounded-full bg-gray-300" />
        Checking…
      </span>
    );
  }

  if (waitHours === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
        <span className="w-2 h-2 rounded-full bg-gray-400" />
        No slots set
      </span>
    );
  }

  if (waitHours < 3) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Available Now
      </span>
    );
  }

  if (waitHours < 24) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        Today at {extractTime(nextAvailable)}
      </span>
    );
  }

  if (waitHours < 48) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-200">
        <span className="w-2 h-2 rounded-full bg-yellow-500" />
        Tomorrow at {extractTime(nextAvailable)}
      </span>
    );
  }

  const days = Math.ceil(waitHours / 24);
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
      <span className="w-2 h-2 rounded-full bg-orange-500" />
      {days} day{days !== 1 ? 's' : ''} wait
    </span>
  );
}

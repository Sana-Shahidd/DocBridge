import { useState } from 'react';
import { useBooking } from '../context/BookingContext';

function hoursLabel(h) {
  if (h === null) return 'N/A';
  if (h < 1) return 'under 1 hour';
  if (h < 24) return `${Math.round(h)} hour${Math.round(h) !== 1 ? 's' : ''}`;
  const d = Math.ceil(h / 24);
  return `${d} day${d !== 1 ? 's' : ''}`;
}

export default function AlternativeDoctorBanner({ alternatives, currentWaitHours }) {
  const [dismissed, setDismissed] = useState(false);
  const [visible,   setVisible]   = useState(true);
  const { openBooking } = useBooking();

  if (dismissed || !alternatives?.length || (currentWaitHours !== null && currentWaitHours < 48)) return null;

  const best = alternatives[0];

  function handleSwitch() {
    // We only have id + name; open booking with a minimal doctor object
    openBooking({
      _id:           best.id,
      fullName:      best.name,
      specialization: best.specialization,
      isAvailable:   true,
    });
    setDismissed(true);
  }

  return (
    <div
      className={`mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
      style={{ animation: 'slideDown 0.3s ease-out' }}
    >
      <style>{`@keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-900">Shorter wait available</p>
            <p className="text-xs text-blue-700 mt-0.5">
              <span className="font-medium">Dr. {best.name}</span> is free in{' '}
              <span className="font-bold">{hoursLabel(best.waitHours)}</span>
              {currentWaitHours !== null && (
                <span className="text-blue-600">
                  {' '}vs. {hoursLabel(currentWaitHours)} for this doctor
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSwitch}
            className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 font-semibold hover:bg-blue-700 transition-colors"
          >
            Switch
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-blue-400 hover:text-blue-600 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

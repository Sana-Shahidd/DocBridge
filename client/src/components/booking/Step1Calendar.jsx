import { useState, useEffect } from 'react';
import { getAvailability } from '../../api/appointmentApi';
import { toDateString, todayString } from '../../utils/timeSlots';

export default function Step1Calendar({ doctor, onSelect }) {
  const [year, setYear]           = useState(() => new Date().getFullYear());
  const [month, setMonth]         = useState(() => new Date().getMonth()); // 0-indexed
  const [availDates, setAvailDates] = useState(new Set());
  const [loading, setLoading]     = useState(false);

  const today = todayString();

  useEffect(() => {
    if (!doctor?._id) return;
    setLoading(true);
    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay  = new Date(year, month + 1, 0);
    const endDay   = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

    getAvailability(doctor._id, { startDate: firstDay, endDate: endDay })
      .then((data) => {
        const dates = new Set(
          (data.availability || [])
            .filter((d) => d.availableSlots > 0)
            .map((d) => d.date)
        );
        setAvailDates(dates);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [doctor, year, month]);

  // Build calendar grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0=Sun
  const cells = Array.from({ length: firstWeekday }, () => null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  );

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-gray-600 text-sm text-center">
        Select an available date for your appointment with{' '}
        <span className="font-semibold text-blue-700">Dr. {doctor?.fullName}</span>
      </p>

      {/* Month navigator */}
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Previous month"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-semibold text-gray-800">{MONTHS[month]} {year}</span>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Next month"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
          ))}
        </div>

        {/* Date cells */}
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isPast      = dateStr < today;
              const isAvailable = availDates.has(dateStr);
              const isToday     = dateStr === today;

              let cls = 'w-full aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all ';
              if (isPast) {
                cls += 'text-gray-300 cursor-not-allowed';
              } else if (isAvailable) {
                cls += 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer shadow-sm hover:shadow-md';
              } else {
                cls += 'text-gray-400 cursor-not-allowed';
              }
              if (isToday && !isPast) {
                cls += ' ring-2 ring-blue-400 ring-offset-1';
              }

              return (
                <button
                  key={dateStr}
                  disabled={isPast || !isAvailable}
                  onClick={() => onSelect(dateStr)}
                  className={cls}
                  title={isAvailable ? 'Available' : isPast ? 'Past date' : 'No slots available'}
                >
                  {day}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-blue-600 inline-block" /> Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded bg-gray-200 inline-block" /> Unavailable
        </span>
      </div>
    </div>
  );
}

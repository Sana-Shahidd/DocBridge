import { useState, useEffect } from 'react';
import { getAvailability } from '../api/appointmentApi';
import { toDateString, todayString } from '../utils/timeSlots';

const DAY_LETTERS = ['S','M','T','W','T','F','S'];

export default function DoctorAvailabilityMini({ doctorId }) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);

  const today = todayString();
  const week  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return toDateString(d);
  });
  const weekEnd = week[6];

  useEffect(() => {
    if (!doctorId) return;
    setLoading(true);
    getAvailability(doctorId, { startDate: today, endDate: weekEnd })
      .then((r) => setData(r.availability || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [doctorId]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">7-Day Availability</p>
      {loading ? (
        <div className="flex gap-1.5">
          {week.map((d) => (
            <div key={d} className="flex flex-col items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          {week.map((dateStr) => {
            const dayData  = data.find((d) => d.date === dateStr);
            const [y, m, d] = dateStr.split('-').map(Number);
            const dayIdx   = new Date(y, m - 1, d).getDay();
            const isToday  = dateStr === today;

            let dotClass = 'bg-gray-200';
            let tooltip   = 'No slots set';

            if (dayData) {
              const ratio = dayData.totalSlots > 0
                ? dayData.availableSlots / dayData.totalSlots
                : 0;
              if (ratio === 0) {
                dotClass = 'bg-red-400';
                tooltip  = 'Fully booked';
              } else if (ratio < 0.5) {
                dotClass = 'bg-yellow-400';
                tooltip  = `${dayData.availableSlots} slot${dayData.availableSlots !== 1 ? 's' : ''} left`;
              } else {
                dotClass = 'bg-green-400';
                tooltip  = `${dayData.availableSlots} slot${dayData.availableSlots !== 1 ? 's' : ''} open`;
              }
            }

            return (
              <div key={dateStr} className="flex flex-col items-center gap-1.5" title={`${dateStr}: ${tooltip}`}>
                <span className={`text-[10px] font-medium ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>
                  {DAY_LETTERS[dayIdx]}
                </span>
                <div className={`w-3 h-3 rounded-full ${dotClass} ${isToday ? 'ring-2 ring-offset-1 ring-blue-400' : ''}`} />
                <span className={`text-[10px] ${isToday ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>{d}</span>
              </div>
            );
          })}
        </div>
      )}
      {/* Legend */}
      <div className="flex gap-3 mt-0.5">
        {[
          { color: 'bg-green-400', label: 'Open' },
          { color: 'bg-yellow-400', label: 'Partial' },
          { color: 'bg-red-400', label: 'Full' },
          { color: 'bg-gray-200', label: 'None' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1 text-[10px] text-gray-400">
            <span className={`w-2 h-2 rounded-full ${color} inline-block`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

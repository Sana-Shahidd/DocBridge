import { useState, useEffect } from 'react';
import { getAvailabilityForDate, setAvailability } from '../api/appointmentApi';
import { ALL_SLOTS, formatSlot, toDateString } from '../utils/timeSlots';

// Build array of next 7 days starting today
function getWeek() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return toDateString(d);
  });
}

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function DoctorAvailabilityPage({ doctorId }) {
  const week = getWeek();
  const [activeDate, setActiveDate] = useState(week[0]);

  // Map of date → Set<time>  (selected slots per date, loaded on demand)
  const [slotMap, setSlotMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState('');

  // Load saved slots whenever activeDate changes
  useEffect(() => {
    if (slotMap[activeDate] !== undefined) return; // already loaded
    setLoading(true);
    getAvailabilityForDate(doctorId, activeDate)
      .then((data) => {
        const times = new Set(
          (data.slots || []).filter((s) => !s.isBooked).map((s) => s.time)
        );
        setSlotMap((m) => ({ ...m, [activeDate]: times }));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeDate, doctorId]);

  function toggleSlot(time) {
    setSlotMap((m) => {
      const prev = new Set(m[activeDate] ?? []);
      prev.has(time) ? prev.delete(time) : prev.add(time);
      return { ...m, [activeDate]: new Set(prev) };
    });
  }

  function selectAll()   { setSlotMap((m) => ({ ...m, [activeDate]: new Set(ALL_SLOTS) })); }
  function clearAll()    { setSlotMap((m) => ({ ...m, [activeDate]: new Set() })); }

  async function saveSlots() {
    setSaving(true);
    try {
      const slots = [...(slotMap[activeDate] ?? [])];
      const result = await setAvailability(doctorId, { date: activeDate, slots });
      if (!result.success) throw new Error(result.message);
      showToast('Availability saved!');
    } catch (err) {
      showToast(err.message || 'Save failed.', true);
    } finally {
      setSaving(false);
    }
  }

  function showToast(msg, isError = false) {
    setToast({ msg, isError });
    setTimeout(() => setToast(''), 3000);
  }

  const currentSlots = slotMap[activeDate] ?? new Set();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Manage Availability</h1>
        <p className="text-gray-500 text-sm mt-1">Select the time slots you are available for the next 7 days.</p>
      </div>

      {/* Week tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-6">
        {week.map((date) => {
          const [y, m, d] = date.split('-').map(Number);
          const dayObj = new Date(y, m - 1, d);
          const label  = DAY_LABELS[dayObj.getDay()];
          const isToday = date === week[0];
          const isActive = date === activeDate;

          return (
            <button
              key={date}
              onClick={() => setActiveDate(date)}
              className={`flex flex-col items-center px-3 py-2 rounded-xl border text-sm font-medium shrink-0 transition-all ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              <span className="text-xs">{label}</span>
              <span className="font-bold">{d}</span>
              {isToday && <span className="text-[10px] mt-0.5 opacity-70">Today</span>}
            </button>
          );
        })}
      </div>

      {/* Slot grid */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">
            {activeDate} — {currentSlots.size} slot{currentSlots.size !== 1 ? 's' : ''} selected
          </h2>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">All</button>
            <span className="text-gray-300">|</span>
            <button onClick={clearAll}  className="text-xs text-gray-500 hover:underline">None</button>
          </div>
        </div>

        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {ALL_SLOTS.map((time) => {
              const selected = currentSlots.has(time);
              return (
                <button
                  key={time}
                  onClick={() => toggleSlot(time)}
                  className={`py-2 rounded-lg border text-sm font-medium transition-all ${
                    selected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  {formatSlot(time)}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={saveSlots}
            disabled={saving}
            className="btn-primary min-w-[140px] flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : 'Save Availability'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${toast.isError ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

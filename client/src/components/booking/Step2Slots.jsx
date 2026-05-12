import { useState, useEffect } from 'react';
import { getAvailabilityForDate } from '../../api/appointmentApi';
import { formatSlot, formatDate } from '../../utils/timeSlots';

export default function Step2Slots({ doctor, date, onSelect, onBack }) {
  const [slots,   setSlots]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    getAvailabilityForDate(doctor._id, date)
      .then((data) => setSlots(data.slots || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [doctor._id, date]);

  function handleConfirm() {
    if (selected) onSelect(selected);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <p className="text-sm text-gray-500">Showing slots for</p>
        <p className="font-semibold text-gray-800">{formatDate(date)}</p>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : slots.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No available slots for this date.</p>
          <button onClick={onBack} className="mt-3 text-blue-600 text-sm underline">
            Choose another date
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {slots.map((slot) => {
              const isBooked   = slot.isBooked;
              const isSelected = selected === slot.time;

              let cls = 'py-2 px-3 rounded-lg border text-sm font-medium transition-all text-center ';
              if (isBooked) {
                cls += 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed line-through';
              } else if (isSelected) {
                cls += 'bg-blue-600 text-white border-blue-600 shadow-md scale-105';
              } else {
                cls += 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50 cursor-pointer';
              }

              return (
                <button
                  key={slot.time}
                  disabled={isBooked}
                  onClick={() => setSelected(slot.time)}
                  className={cls}
                  title={isBooked ? 'Already booked' : ''}
                >
                  {formatSlot(slot.time)}
                </button>
              );
            })}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onBack} className="btn-outline flex-1">
              ← Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </>
      )}
    </div>
  );
}

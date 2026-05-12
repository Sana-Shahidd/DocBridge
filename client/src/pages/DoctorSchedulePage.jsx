import { useState, useEffect } from 'react';
import { getDoctorAppointments } from '../api/appointmentApi';
import { formatSlot, todayString, toDateString } from '../utils/timeSlots';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function DoctorSchedulePage({ doctorId }) {
  const today = todayString();
  const [date,         setDate]         = useState(today);
  const [appointments, setAppointments] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [selected,     setSelected]     = useState(null); // appointment details modal

  useEffect(() => {
    if (!doctorId) return;
    setLoading(true);
    getDoctorAppointments(doctorId, date)
      .then((data) => setAppointments(data.appointments || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [doctorId, date]);

  // Navigation: prev / next day
  function shift(days) {
    const [y, m, d] = date.split('-').map(Number);
    const next = new Date(y, m - 1, d + days);
    setDate(toDateString(next));
  }

  const confirmed  = appointments.filter((a) => a.status === 'confirmed');
  const cancelled  = appointments.filter((a) => a.status === 'cancelled');
  const completed  = appointments.filter((a) => a.status === 'completed');

  const [y, mo, d] = date.split('-').map(Number);
  const dayLabel = new Date(y, mo - 1, d);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Doctor Schedule</h1>
        <p className="text-gray-500 text-sm mt-1">View appointments for any day.</p>
      </div>

      {/* Date navigator */}
      <div className="flex items-center justify-between mb-6 card py-3 px-5">
        <button
          onClick={() => shift(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Previous day"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <p className="font-bold text-gray-900 text-lg">
            {DAYS[dayLabel.getDay()]}, {d} {MONTHS[mo - 1]} {y}
          </p>
          {date === today && <span className="text-xs text-blue-600 font-semibold">Today</span>}
        </div>
        <button
          onClick={() => shift(1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Next day"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Confirmed', count: confirmed.length,  color: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'Completed', count: completed.length,  color: 'bg-blue-50 border-blue-200 text-blue-700' },
          { label: 'Cancelled', count: cancelled.length,  color: 'bg-red-50 border-red-200 text-red-600' },
        ].map(({ label, count, color }) => (
          <div key={label} className={`rounded-xl border p-3 text-center ${color}`}>
            <p className="text-2xl font-bold">{count}</p>
            <p className="text-xs font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🗓</p>
          <p>No appointments scheduled for this day.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...appointments].sort((a, b) => a.time.localeCompare(b.time)).map((appt) => {
            const statusColor = {
              confirmed: 'border-l-green-500 bg-green-50',
              cancelled: 'border-l-red-400 bg-red-50',
              completed: 'border-l-blue-500 bg-blue-50',
            }[appt.status] || '';

            return (
              <button
                key={appt._id}
                onClick={() => setSelected(appt)}
                className={`w-full text-left card border-l-4 py-3 px-4 hover:shadow-md transition-shadow ${statusColor}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-blue-700 text-sm">{formatSlot(appt.time)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                        appt.status === 'confirmed' ? 'bg-green-200 text-green-800' :
                        appt.status === 'cancelled' ? 'bg-red-200 text-red-700' :
                        'bg-blue-200 text-blue-800'
                      }`}>{appt.status}</span>
                    </div>
                    <p className="font-medium text-gray-900 mt-0.5">{appt.patientName}</p>
                    <p className="text-xs text-gray-500">{appt.patientPhone} · {appt.type === 'online' ? '💻 Online' : '🏥 In-Person'}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold text-gray-900">Appointment Details</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-2 text-sm">
              {[
                ['Patient', selected.patientName],
                ['Phone',   selected.patientPhone],
                selected.patientEmail ? ['Email', selected.patientEmail] : null,
                ['Date',    selected.date],
                ['Time',    formatSlot(selected.time)],
                ['Type',    selected.type === 'online' ? '💻 Online' : '🏥 In-Person'],
                ['Status',  selected.status],
                ['Fee',     `PKR ${selected.doctorFee?.toLocaleString()}`],
                ['Ref #',   selected.referenceNumber],
                selected.note ? ['Note', selected.note] : null,
                selected.cancellationReason ? ['Cancel reason', selected.cancellationReason] : null,
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <span className="text-gray-400 w-28 shrink-0">{label}</span>
                  <span className="text-gray-800 font-medium">{value}</span>
                </div>
              ))}
            </div>

            <button onClick={() => setSelected(null)} className="btn-primary w-full mt-5">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

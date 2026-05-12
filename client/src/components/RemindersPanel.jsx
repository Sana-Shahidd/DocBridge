import { useState, useEffect } from 'react';
import { getAppointmentsByPhone } from '../api/appointmentApi';
import { formatSlot, todayString } from '../utils/timeSlots';

function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const apptDate = new Date(y, m - 1, d);
  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((apptDate - today) / 864e5);
}

function daysAgo(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const apptDate = new Date(y, m - 1, d);
  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today - apptDate) / 864e5);
}

export default function RemindersPanel({ patientPhone, onBookNow }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState(patientPhone || '');
  const [searched, setSearched] = useState(!!patientPhone);

  const today = todayString();

  async function search(p) {
    if (!p?.trim()) return;
    setLoading(true);
    try {
      const data = await getAppointmentsByPhone(p.trim());
      setAppointments(data.appointments || []);
      setSearched(true);
    } catch { /**/ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (patientPhone) search(patientPhone);
  }, [patientPhone]);

  const upcoming = appointments.filter((a) => a.status === 'confirmed' && a.date >= today);
  const followupDue = appointments.filter(
    (a) => a.status === 'completed' && a.returnReminderDate && a.returnReminderDate <= today
  );
  const past = appointments.filter((a) => (a.status === 'cancelled' || a.status === 'completed') && a.date < today);

  return (
    <div className="card flex flex-col gap-4">
      <h3 className="font-bold text-gray-900 flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        Reminders
      </h3>

      {!patientPhone && (
        <form
          onSubmit={(e) => { e.preventDefault(); search(phone); }}
          className="flex gap-2"
        >
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Your phone number"
            className="form-input flex-1 text-sm"
          />
          <button type="submit" className="btn-primary px-3 text-sm py-2" disabled={loading}>
            {loading ? '…' : 'Go'}
          </button>
        </form>
      )}

      {searched && !loading && (
        <div className="flex flex-col gap-3">
          {/* Follow-up due */}
          {followupDue.map((a) => (
            <div key={a._id} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">Follow-up Due</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Dr. {a.doctorName} recommended a check-up
                  {a.doctorNote && <span className="italic"> — "{a.doctorNote.slice(0, 60)}{a.doctorNote.length > 60 ? '…' : ''}"</span>}
                </p>
              </div>
              <button
                onClick={() => onBookNow?.(a.doctorSpecialization)}
                className="text-xs bg-amber-600 text-white rounded-lg px-2 py-1 font-semibold shrink-0"
              >
                Book Now
              </button>
            </div>
          ))}

          {/* Upcoming appointments */}
          {upcoming.map((a) => {
            const n = daysUntil(a.date);
            return (
              <div key={a._id} className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-blue-900">
                    Appointment with Dr. {a.doctorName}
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    {n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`} · {formatSlot(a.time)} · {a.type === 'online' ? 'Online' : 'In-Person'}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full font-bold shrink-0 ${n === 0 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  {a.referenceNumber}
                </span>
              </div>
            );
          })}

          {/* Past appointments with review prompt */}
          {past.filter((a) => a.status === 'completed').slice(0, 2).map((a) => (
            <div key={a._id} className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-600">
                  Completed {daysAgo(a.date)}d ago · Dr. {a.doctorName}
                </p>
              </div>
            </div>
          ))}

          {upcoming.length === 0 && followupDue.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-3">No upcoming reminders.</p>
          )}
        </div>
      )}
    </div>
  );
}

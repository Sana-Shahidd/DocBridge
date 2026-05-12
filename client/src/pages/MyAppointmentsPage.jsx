import { useState } from 'react';
import { getAppointmentsByPhone, cancelAppointment } from '../api/appointmentApi';
import { formatSlot, formatDate, todayString } from '../utils/timeSlots';

export default function MyAppointmentsPage() {
  const [phone,        setPhone]        = useState('');
  const [appointments, setAppointments] = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [tab,          setTab]          = useState('upcoming'); // 'upcoming' | 'past'
  const [error,        setError]        = useState('');
  const [cancelId,     setCancelId]     = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [toast,        setToast]        = useState('');

  const today = todayString();

  async function handleSearch(e) {
    e.preventDefault();
    if (!phone.trim()) return;
    setError('');
    setLoading(true);
    try {
      const data = await getAppointmentsByPhone(phone.trim());
      if (!data.success) throw new Error(data.message);
      setAppointments(data.appointments);
    } catch (err) {
      setError(err.message || 'Failed to load appointments.');
      setAppointments(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    setCancelLoading(true);
    try {
      const data = await cancelAppointment(cancelId, cancelReason);
      if (!data.success) throw new Error(data.message);
      setAppointments((prev) =>
        prev.map((a) => (a._id === cancelId ? { ...a, status: 'cancelled', cancellationReason: cancelReason } : a))
      );
      setCancelId(null);
      setCancelReason('');
      showToast('Appointment cancelled.');
    } catch (err) {
      showToast(err.message || 'Cancel failed.', true);
    } finally {
      setCancelLoading(false);
    }
  }

  function showToast(msg, isError = false) {
    setToast({ msg, isError });
    setTimeout(() => setToast(''), 3000);
  }

  function hoursUntil(dateStr, timeStr) {
    const apptMs = new Date(`${dateStr}T${timeStr}:00+05:00`).getTime();
    return (apptMs - Date.now()) / 36e5;
  }

  const upcoming = (appointments || []).filter(
    (a) => a.status !== 'cancelled' && a.date >= today
  );
  const past = (appointments || []).filter(
    (a) => a.status === 'cancelled' || a.date < today
  );
  const displayed = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Appointments</h1>
        <p className="text-gray-500 text-sm mt-1">Enter your phone number to view your booked appointments.</p>
      </div>

      {/* Phone lookup */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. 03001234567"
          className="form-input flex-1"
        />
        <button type="submit" className="btn-primary px-6" disabled={loading}>
          {loading ? '…' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm mb-4">{error}</div>
      )}

      {appointments !== null && (
        <>
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-5">
            {[['upcoming', `Upcoming (${upcoming.length})`], ['past', `Past / Cancelled (${past.length})`]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {displayed.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">📅</p>
              <p>No {tab} appointments found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map((appt) => {
                const canCancel = appt.status === 'confirmed' && hoursUntil(appt.date, appt.time) >= 24;
                const statusColor = {
                  confirmed: 'bg-green-100 text-green-700',
                  cancelled: 'bg-red-100 text-red-600',
                  completed: 'bg-gray-100 text-gray-600',
                }[appt.status] || 'bg-gray-100 text-gray-600';

                return (
                  <div key={appt._id} className="card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-gray-900">Dr. {appt.doctorName}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColor}`}>
                            {appt.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">{appt.doctorSpecialization}</p>
                        <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-700">
                          <span>📅 {formatDate(appt.date)}</span>
                          <span>🕐 {formatSlot(appt.time)}</span>
                          <span className="capitalize">{appt.type === 'online' ? '💻 Online' : '🏥 In-Person'}</span>
                        </div>
                        {appt.note && (
                          <p className="text-xs text-gray-500 mt-1.5 italic">"{appt.note}"</p>
                        )}
                        {appt.status === 'cancelled' && appt.cancellationReason && (
                          <p className="text-xs text-red-500 mt-1">Reason: {appt.cancellationReason}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-blue-700">PKR {appt.doctorFee?.toLocaleString()}</p>
                        <p className="text-xs text-gray-400 font-mono mt-1">{appt.referenceNumber}</p>
                        {canCancel && (
                          <button
                            onClick={() => { setCancelId(appt._id); setCancelReason(''); }}
                            className="mt-2 text-xs text-red-500 hover:text-red-700 underline"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Cancel modal */}
      {cancelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-900 mb-1">Cancel Appointment</h3>
            <p className="text-gray-500 text-sm mb-4">Please provide a reason (optional).</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="e.g. Schedule conflict…"
              className="form-input resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setCancelId(null)}
                className="btn-outline flex-1"
              >
                Keep It
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelLoading}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-60"
              >
                {cancelLoading ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.isError ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

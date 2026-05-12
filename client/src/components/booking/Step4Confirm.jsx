import { useState } from 'react';
import { createAppointment } from '../../api/appointmentApi';
import { formatSlot, formatDate } from '../../utils/timeSlots';

export default function Step4Confirm({ doctor, date, time, details, onBack, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleConfirm() {
    setLoading(true);
    setError('');
    try {
      const result = await createAppointment({
        doctorId:     doctor._id,
        date,
        time,
        type:         details.type,
        patientName:  details.patientName,
        patientPhone: details.patientPhone,
        patientEmail: details.patientEmail || undefined,
        note:         details.note || undefined,
      });

      if (!result.success) {
        setError(result.message || 'Booking failed. Please try again.');
        return;
      }
      onSuccess(result.appointment);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  const rows = [
    { label: 'Doctor',         value: `Dr. ${doctor.fullName}` },
    { label: 'Specialization', value: doctor.specialization },
    { label: 'Date',           value: formatDate(date) },
    { label: 'Time',           value: formatSlot(time) },
    { label: 'Type',           value: details.type === 'online' ? '💻 Online' : '🏥 In-Person' },
    { label: 'Patient',        value: details.patientName },
    { label: 'Phone',          value: details.patientPhone },
    details.patientEmail ? { label: 'Email', value: details.patientEmail } : null,
    details.note ? { label: 'Note', value: details.note } : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-600 text-center">
        Please review your appointment details before confirming.
      </p>

      {/* Summary table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {rows.map(({ label, value }, i) => (
          <div
            key={label}
            className={`flex gap-4 px-4 py-3 text-sm ${i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
          >
            <span className="text-gray-500 w-32 shrink-0">{label}</span>
            <span className="text-gray-800 font-medium">{value}</span>
          </div>
        ))}
      </div>

      {/* Fee */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
        <span className="text-blue-800 font-semibold">Consultation Fee</span>
        <span className="text-blue-900 text-xl font-bold">
          PKR {doctor.hourlyFee?.toLocaleString()}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm text-center">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={onBack} disabled={loading} className="btn-outline flex-1">
          ← Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="btn-primary flex-1 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Booking…
            </>
          ) : (
            'Confirm & Book'
          )}
        </button>
      </div>
    </div>
  );
}

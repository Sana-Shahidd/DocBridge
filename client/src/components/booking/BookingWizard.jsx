import { useState, useEffect } from 'react';
import { useBooking } from '../../context/BookingContext';
import Step1Calendar from './Step1Calendar';
import Step2Slots    from './Step2Slots';
import Step3Details  from './Step3Details';
import Step4Confirm  from './Step4Confirm';
import { formatSlot, formatDate } from '../../utils/timeSlots';

const STEPS = ['Select Date', 'Choose Time', 'Your Details', 'Confirm'];

export default function BookingWizard() {
  const { bookingDoctor, closeBooking } = useBooking();

  const [step,    setStep]    = useState(1);
  const [date,    setDate]    = useState(null);
  const [time,    setTime]    = useState(null);
  const [details, setDetails] = useState(null);
  const [booked,  setBooked]  = useState(null); // confirmed appointment

  // Reset when a new doctor is selected
  useEffect(() => {
    setStep(1);
    setDate(null);
    setTime(null);
    setDetails(null);
    setBooked(null);
  }, [bookingDoctor]);

  if (!bookingDoctor) return null;

  function handleDateSelect(d)    { setDate(d);    setStep(2); }
  function handleSlotSelect(t)    { setTime(t);    setStep(3); }
  function handleDetailsSubmit(d) { setDetails(d); setStep(4); }
  function handleSuccess(appt)    { setBooked(appt); }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-blue-600 px-6 py-5 flex items-start justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">Book Appointment</h2>
            <p className="text-blue-200 text-sm mt-0.5">Dr. {bookingDoctor.fullName} · {bookingDoctor.specialization}</p>
          </div>
          <button
            onClick={closeBooking}
            className="text-blue-200 hover:text-white transition-colors mt-0.5"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        {!booked && (
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-0">
              {STEPS.map((label, i) => {
                const n = i + 1;
                const active = n === step;
                const done   = n < step;
                return (
                  <div key={label} className="flex items-center flex-1 last:flex-none">
                    <div className={`flex items-center gap-1.5 ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                          done   ? 'bg-green-500 text-white' :
                          active ? 'bg-blue-600 text-white' :
                                   'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {done ? '✓' : n}
                      </div>
                      <span className={`text-xs hidden sm:block ${active ? 'text-blue-700 font-semibold' : 'text-gray-400'}`}>
                        {label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`h-px flex-1 mx-2 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {booked ? (
            <BookingSuccess appointment={booked} onClose={closeBooking} />
          ) : step === 1 ? (
            <Step1Calendar doctor={bookingDoctor} onSelect={handleDateSelect} />
          ) : step === 2 ? (
            <Step2Slots
              doctor={bookingDoctor}
              date={date}
              onSelect={handleSlotSelect}
              onBack={() => setStep(1)}
            />
          ) : step === 3 ? (
            <Step3Details
              doctor={bookingDoctor}
              onSubmit={handleDetailsSubmit}
              onBack={() => setStep(2)}
            />
          ) : (
            <Step4Confirm
              doctor={bookingDoctor}
              date={date}
              time={time}
              details={details}
              onBack={() => setStep(3)}
              onSuccess={handleSuccess}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BookingSuccess({ appointment, onClose }) {
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
        <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-1">Appointment Confirmed!</h3>
        <p className="text-gray-500 text-sm">Your appointment has been successfully booked.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
        <p className="text-amber-700 text-xs mb-1">Reference Number</p>
        <p className="text-amber-900 font-mono font-bold text-lg">{appointment.referenceNumber}</p>
        <p className="text-amber-600 text-xs mt-1">Save this to manage your appointment</p>
      </div>

      <div className="text-sm text-gray-600 space-y-1.5">
        <p><span className="font-medium">Date:</span> {formatDate(appointment.date)}</p>
        <p><span className="font-medium">Time:</span> {formatSlot(appointment.time)}</p>
        <p><span className="font-medium">Doctor:</span> Dr. {appointment.doctorName}</p>
        {appointment.patientEmail && (
          <p className="text-xs text-gray-400">A confirmation email has been sent to {appointment.patientEmail}</p>
        )}
      </div>

      <button onClick={onClose} className="btn-primary w-full mt-2">
        Done
      </button>
    </div>
  );
}

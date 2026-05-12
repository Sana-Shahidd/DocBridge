// ─────────────────────────────────────────────────────────────────────────────
// Appointment Routes – MediShield AI
//
//  POST  /api/appointments              Book a new appointment
//  GET   /api/appointments              List appointments (by patientPhone or doctorId+date)
//  PATCH /api/appointments/:id/cancel   Cancel if >24 hours away
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const DoctorAvailability = require('../models/DoctorAvailability');
const Doctor = require('../models/Doctor');
const { sendAppointmentConfirmation } = require('../utils/mailer');

// ── Reference number generator ────────────────────────────────────────────────
function generateRef() {
  const seg = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `MS-${seg()}-${seg()}`;
}

// ── Hours between now and appointment (Pakistan UTC+5) ────────────────────────
function hoursUntil(dateStr, timeStr) {
  const apptMs = new Date(`${dateStr}T${timeStr}:00+05:00`).getTime();
  return (apptMs - Date.now()) / 36e5;
}

// ── POST /api/appointments ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      doctorId, date, time, type,
      patientName, patientPhone, patientEmail, note,
    } = req.body;

    // ── Basic validation ──────────────────────────────────────────────────────
    if (!doctorId || !date || !time || !type || !patientName || !patientPhone) {
      return res.status(400).json({
        success: false,
        message: 'doctorId, date, time, type, patientName, and patientPhone are required.',
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Date must be YYYY-MM-DD.' });
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ success: false, message: 'Time must be HH:MM.' });
    }
    if (!['online', 'physical'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Type must be online or physical.' });
    }

    // ── Conflict check (active appointment for same slot) ─────────────────────
    const conflict = await Appointment.findOne({
      doctorId, date, time, status: { $ne: 'cancelled' },
    });
    if (conflict) {
      return res.status(409).json({
        success: false,
        message: 'This time slot has already been booked. Please choose another slot.',
      });
    }

    // ── Verify slot exists in doctor availability ─────────────────────────────
    const avail = await DoctorAvailability.findOne({ doctorId, date });
    if (!avail) {
      return res.status(400).json({
        success: false,
        message: 'Doctor has no availability set for this date.',
      });
    }
    const slot = avail.slots.find((s) => s.time === time);
    if (!slot) {
      return res.status(400).json({
        success: false,
        message: 'Selected time slot is not available for this doctor.',
      });
    }
    if (slot.isBooked) {
      return res.status(409).json({
        success: false,
        message: 'This time slot is already booked.',
      });
    }

    // ── Fetch doctor snapshot ─────────────────────────────────────────────────
    const doctor = await Doctor.findById(doctorId).lean();
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found.' });
    }

    // ── Create appointment ────────────────────────────────────────────────────
    let referenceNumber;
    let attempts = 0;
    do {
      referenceNumber = generateRef();
      attempts++;
      if (attempts > 10) throw new Error('Could not generate unique reference number');
    } while (await Appointment.findOne({ referenceNumber }));

    const appointment = await Appointment.create({
      doctorId,
      doctorName:           doctor.fullName,
      doctorSpecialization: doctor.specialization,
      doctorEmail:          doctor.email ?? null,
      doctorFee:            doctor.hourlyFee,
      patientName,
      patientPhone,
      patientEmail: patientEmail || null,
      date,
      time,
      type,
      note: note || '',
      referenceNumber,
      status: 'confirmed',
    });

    // ── Mark slot as booked in availability doc ───────────────────────────────
    await DoctorAvailability.updateOne(
      { doctorId, date, 'slots.time': time },
      { $set: { 'slots.$.isBooked': true } }
    );

    // ── Fire confirmation emails (non-blocking) ───────────────────────────────
    sendAppointmentConfirmation(appointment).catch((e) =>
      console.error('Email send error:', e.message)
    );

    res.status(201).json({ success: true, appointment });
  } catch (err) {
    console.error('Appointment POST error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── GET /api/appointments ─────────────────────────────────────────────────────
// ?patientPhone=03001234567              → patient's own appointments
// ?doctorId=<id>&date=YYYY-MM-DD         → doctor's schedule for a date
// ?doctorId=<id>                         → all doctor appointments
router.get('/', async (req, res) => {
  try {
    const { patientPhone, doctorId, date } = req.query;

    if (!patientPhone && !doctorId) {
      return res.status(400).json({
        success: false,
        message: 'Provide patientPhone or doctorId query parameter.',
      });
    }

    const filter = {};
    if (patientPhone) filter.patientPhone = patientPhone;
    if (doctorId)     filter.doctorId = doctorId;
    if (date)         filter.date = date;

    const appointments = await Appointment.find(filter)
      .sort({ date: 1, time: 1 })
      .lean();

    res.json({ success: true, appointments });
  } catch (err) {
    console.error('Appointment GET error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── PATCH /api/appointments/:id/cancel ───────────────────────────────────────
router.patch('/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }
    if (appointment.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Appointment is already cancelled.' });
    }

    // Enforce 24-hour cancellation window
    if (hoursUntil(appointment.date, appointment.time) < 24) {
      return res.status(400).json({
        success: false,
        message: 'Appointments can only be cancelled at least 24 hours in advance.',
      });
    }

    appointment.status = 'cancelled';
    appointment.cancellationReason = reason || '';
    await appointment.save();

    // Free the slot in availability doc
    await DoctorAvailability.updateOne(
      { doctorId: appointment.doctorId, date: appointment.date, 'slots.time': appointment.time },
      { $set: { 'slots.$.isBooked': false } }
    );

    res.json({ success: true, appointment });
  } catch (err) {
    console.error('Appointment CANCEL error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── POST /api/appointments/:id/followup-note ─────────────────────────────────
// Doctor adds a note and optional "return in X days" instruction.
router.post('/:id/followup-note', async (req, res) => {
  try {
    const { note, returnInDays } = req.body;

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    appointment.doctorNote = note || '';

    if (returnInDays && Number.isInteger(Number(returnInDays)) && Number(returnInDays) > 0) {
      appointment.returnInDays = Number(returnInDays);
      // Compute return date from today
      const d = new Date(Date.now() + (5 * 60 * 60 * 1000)); // UTC+5
      d.setUTCDate(d.getUTCDate() + Number(returnInDays));
      const y  = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dy = String(d.getUTCDate()).padStart(2, '0');
      appointment.returnReminderDate = `${y}-${mo}-${dy}`;
      appointment.returnReminderSent = false;
    }

    await appointment.save();
    res.json({ success: true, appointment });
  } catch (err) {
    console.error('Followup-note error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// ── GET /api/appointments/:id/calendar.ics ────────────────────────────────────
router.get('/:id/calendar.ics', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id).lean();
    if (!appointment) {
      return res.status(404).send('Appointment not found.');
    }

    const [h, m] = appointment.time.split(':').map(Number);
    const endTotalMins = h * 60 + m + 30; // 30-min slot
    const endH = String(Math.floor(endTotalMins / 60)).padStart(2, '0');
    const endM = String(endTotalMins % 60).padStart(2, '0');

    const dateCompact = appointment.date.replace(/-/g, '');
    const timeCompact = appointment.time.replace(':', '') + '00';
    const endCompact  = `${endH}${endM}00`;
    const stampNow    = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MediShield AI//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${appointment._id}@medishield.ai`,
      `DTSTAMP:${stampNow}`,
      `DTSTART;TZID=Asia/Karachi:${dateCompact}T${timeCompact}`,
      `DTEND;TZID=Asia/Karachi:${dateCompact}T${endCompact}`,
      `SUMMARY:Appointment with Dr. ${appointment.doctorName}`,
      `DESCRIPTION:MediShield AI Appointment\\nPatient: ${appointment.patientName}\\nType: ${appointment.type}\\nRef: ${appointment.referenceNumber}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="appointment-${appointment.referenceNumber}.ics"`);
    res.send(ics);
  } catch (err) {
    console.error('ICS error:', err);
    res.status(500).send('Server error: ' + err.message);
  }
});

module.exports = router;

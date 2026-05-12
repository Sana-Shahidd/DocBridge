// ─────────────────────────────────────────────────────────────────────────────
// Reminder & Follow-up Cron Jobs – MediShield AI
//
//  Runs every hour. Three checks:
//  1. Appointment reminders  — tomorrow's confirmed appointments
//  2. Follow-up emails       — past confirmed → mark completed + send review link
//  3. Return reminders       — doctor-set "return in X days" reminder
// ─────────────────────────────────────────────────────────────────────────────
const cron        = require('node-cron');
const Appointment = require('../models/Appointment');
const {
  sendReminderEmail,
  sendFollowupEmail,
  sendReturnReminderEmail,
} = require('../utils/mailer');

// Pakistan is UTC+5. We store dates as YYYY-MM-DD strings in local time.
function pkDate(offsetDays = 0) {
  const d = new Date(Date.now() + (5 * 60 * 60 * 1000)); // shift to UTC+5
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const y  = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dy = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

// ── Job 1 — Send day-before reminders ────────────────────────────────────────
async function checkAppointmentReminders() {
  try {
    const tomorrow = pkDate(1);
    const pending = await Appointment.find({
      date:          tomorrow,
      status:        'confirmed',
      reminderSent:  false,
    });

    if (pending.length) console.log(`[Reminders] ${pending.length} reminder(s) to send for ${tomorrow}`);

    for (const appt of pending) {
      try {
        await sendReminderEmail(appt);
        appt.reminderSent = true;
        await appt.save();
      } catch (err) {
        console.error(`[Reminders] Failed ${appt._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Reminders] Job error:', err.message);
  }
}

// ── Job 2 — Auto-complete past appointments + send follow-up ─────────────────
async function checkFollowups() {
  try {
    const today = pkDate(0);
    const past = await Appointment.find({
      date:         { $lt: today },
      status:       'confirmed',
      followupSent: false,
    });

    if (past.length) console.log(`[Followups] ${past.length} appointment(s) to complete`);

    for (const appt of past) {
      try {
        appt.status      = 'completed';
        appt.followupSent = true;
        await appt.save();
        await sendFollowupEmail(appt);
      } catch (err) {
        console.error(`[Followups] Failed ${appt._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Followups] Job error:', err.message);
  }
}

// ── Job 3 — Return-visit reminders (doctor-prescribed) ───────────────────────
async function checkReturnReminders() {
  try {
    const today = pkDate(0);
    const due = await Appointment.find({
      returnReminderDate: today,
      returnReminderSent: false,
      status:             'completed',
    });

    if (due.length) console.log(`[ReturnReminders] ${due.length} return reminder(s) to send`);

    for (const appt of due) {
      try {
        await sendReturnReminderEmail(appt);
        appt.returnReminderSent = true;
        await appt.save();
      } catch (err) {
        console.error(`[ReturnReminders] Failed ${appt._id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[ReturnReminders] Job error:', err.message);
  }
}

// ── Start all cron jobs ───────────────────────────────────────────────────────
function startJobs() {
  // Every hour at minute 0
  cron.schedule('0 * * * *', () => {
    console.log('[Cron] Hourly jobs running…');
    checkAppointmentReminders();
    checkFollowups();
    checkReturnReminders();
  });

  console.log('✅ Cron jobs scheduled (hourly at :00)');

  // Catch-up run 5s after startup so missed completions are processed immediately
  setTimeout(() => {
    checkFollowups();
    checkReturnReminders();
  }, 5000);
}

module.exports = { startJobs };

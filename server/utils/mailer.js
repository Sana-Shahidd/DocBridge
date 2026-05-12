// ─────────────────────────────────────────────────────────────────────────────
// Mailer – MediShield AI
//
// Sends HTML email notifications to doctors when a new patient message arrives
// via the AI chatbot.
//
// Transport: Gmail SMTP (App Password) by default.
// Set EMAIL_HOST / EMAIL_PORT in .env for other SMTP providers (SendGrid, etc.)
//
// If no email credentials are configured, the function logs a warning and
// returns gracefully – notifications are optional, not mission-critical.
// ─────────────────────────────────────────────────────────────────────────────
const nodemailer = require('nodemailer');

// ── Transport (created once, reused for all sends) ────────────────────────────
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null; // Email not configured
  }

  transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST  || 'smtp.gmail.com',
    port:   Number(process.env.EMAIL_PORT) || 587,
    secure: false, // TLS via STARTTLS (port 587)
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return transporter;
}

// ── HTML Email Template ───────────────────────────────────────────────────────
function buildEmailHtml({ doctorName, patientName, patientPhone, symptoms, referenceNumber, dashboardUrl }) {
  const timestamp = new Date().toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Patient Message – MediShield AI</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);padding:32px 40px;text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:12px 20px;margin-bottom:12px;">
                      <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">❤️ MediShield AI</span>
                    </div>
                    <br/>
                    <span style="color:#bfdbfe;font-size:14px;">AI-Powered Healthcare Platform • Pakistan</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Alert banner -->
          <tr>
            <td style="background:#eff6ff;border-bottom:3px solid #2563eb;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#1e40af;font-size:15px;font-weight:700;">
                🔔 New Patient Message Received
              </p>
              <p style="margin:4px 0 0;color:#3b82f6;font-size:13px;">${timestamp}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 24px;color:#374151;font-size:16px;line-height:1.6;">
                Dear <strong>Dr. ${doctorName}</strong>,
              </p>
              <p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.7;">
                A patient has left a message through your AI assistant on MediShield AI while you were unavailable.
                Please review their details and follow up at your earliest convenience.
              </p>

              <!-- Patient details card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:28px;">
                <tr>
                  <td style="background:#1e40af;padding:14px 24px;">
                    <span style="color:#ffffff;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Patient Details</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="color:#6b7280;font-size:13px;display:block;margin-bottom:2px;">👤 Full Name</span>
                          <span style="color:#111827;font-size:15px;font-weight:600;">${patientName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="color:#6b7280;font-size:13px;display:block;margin-bottom:2px;">📱 WhatsApp Number</span>
                          <span style="color:#111827;font-size:15px;font-weight:600;">${patientPhone}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#6b7280;font-size:13px;display:block;margin-bottom:2px;">🩺 Symptoms / Concern</span>
                          <span style="color:#111827;font-size:15px;line-height:1.6;">${symptoms}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Reference number -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;margin-bottom:32px;">
                <tr>
                  <td style="padding:14px 20px;text-align:center;">
                    <span style="color:#92400e;font-size:13px;">Patient Reference Number: </span>
                    <span style="color:#92400e;font-size:15px;font-weight:800;font-family:monospace;">${referenceNumber}</span>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}"
                       style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#ffffff;
                              text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;
                              border-radius:12px;letter-spacing:0.3px;">
                      View Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
                This message was sent automatically by the MediShield AI chatbot.<br/>
                If you have questions, contact <a href="mailto:support@medishield.ai" style="color:#2563eb;">support@medishield.ai</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * sendDoctorNotification(options)
 * Sends a formatted HTML email to the doctor when a new patient message arrives.
 * Silently skips if email is not configured so other features still work.
 */
async function sendDoctorNotification({
  doctorEmail,
  doctorName,
  patientName,
  patientPhone,
  symptoms,
  referenceNumber,
}) {
  const smtp = getTransporter();
  if (!smtp) {
    console.warn('⚠️  Email not configured (EMAIL_USER/EMAIL_PASS missing). Skipping notification.');
    return { sent: false, reason: 'not-configured' };
  }

  // Use the doctor's own email, fall back to the admin address set in .env
  const toAddress = doctorEmail || process.env.ADMIN_NOTIFY_EMAIL;
  if (!toAddress) {
    console.warn('⚠️  No recipient email address. Set ADMIN_NOTIFY_EMAIL in .env as fallback.');
    return { sent: false, reason: 'no-recipient' };
  }

  const dashboardUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}?tab=dashboard`;

  try {
    const info = await smtp.sendMail({
      from:    process.env.EMAIL_FROM || `"MediShield AI" <${process.env.EMAIL_USER}>`,
      to:      toAddress,
      subject: `[MediShield AI] New Patient Message – ${patientName} | ${referenceNumber}`,
      html:    buildEmailHtml({ doctorName, patientName, patientPhone, symptoms, referenceNumber, dashboardUrl }),
    });

    console.log(`✉️  Email sent to ${toAddress} — messageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

// ── Appointment confirmation email templates ──────────────────────────────────
function buildPatientConfirmationHtml(appt) {
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  return `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Appointment Confirmed</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);padding:32px 40px;text-align:center;">
          <span style="color:#fff;font-size:22px;font-weight:800;">❤️ MediShield AI</span><br/>
          <span style="color:#bfdbfe;font-size:13px;">Your appointment is confirmed!</span>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px;">
          <p style="margin:0 0 20px;color:#374151;font-size:16px;">Dear <strong>${appt.patientName}</strong>,</p>
          <p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.7;">
            Your appointment has been successfully booked on MediShield AI. Please find your details below.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="background:#1e40af;padding:14px 24px;"><span style="color:#fff;font-size:13px;font-weight:700;text-transform:uppercase;">Appointment Details</span></td></tr>
            <tr><td style="padding:24px;">
              <table width="100%" cellpadding="4">
                <tr><td style="color:#6b7280;font-size:13px;width:40%;">Doctor</td><td style="color:#111827;font-weight:600;">Dr. ${appt.doctorName}</td></tr>
                <tr><td style="color:#6b7280;font-size:13px;">Specialization</td><td style="color:#111827;">${appt.doctorSpecialization}</td></tr>
                <tr><td style="color:#6b7280;font-size:13px;">Date</td><td style="color:#111827;font-weight:600;">${appt.date}</td></tr>
                <tr><td style="color:#6b7280;font-size:13px;">Time</td><td style="color:#111827;font-weight:600;">${appt.time}</td></tr>
                <tr><td style="color:#6b7280;font-size:13px;">Type</td><td style="color:#111827;text-transform:capitalize;">${appt.type}</td></tr>
                <tr><td style="color:#6b7280;font-size:13px;">Fee</td><td style="color:#111827;font-weight:600;">PKR ${appt.doctorFee.toLocaleString()}</td></tr>
                ${appt.note ? `<tr><td style="color:#6b7280;font-size:13px;">Note</td><td style="color:#111827;">${appt.note}</td></tr>` : ''}
              </table>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;margin-bottom:32px;">
            <tr><td style="padding:14px 20px;text-align:center;">
              <span style="color:#92400e;font-size:13px;">Reference Number: </span>
              <span style="color:#92400e;font-size:15px;font-weight:800;font-family:monospace;">${appt.referenceNumber}</span>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${baseUrl}?tab=my-appointments"
               style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:12px;">
              View My Appointments →
            </a>
          </td></tr></table>
        </td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">MediShield AI • Pakistan's AI-Powered Healthcare Platform</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildDoctorAppointmentHtml(appt) {
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  return `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>New Appointment – MediShield AI</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);padding:32px 40px;text-align:center;">
          <span style="color:#fff;font-size:22px;font-weight:800;">❤️ MediShield AI</span><br/>
          <span style="color:#bfdbfe;font-size:13px;">New appointment booked</span>
        </td>
      </tr>
      <tr>
        <td style="background:#eff6ff;border-bottom:3px solid #2563eb;padding:16px 40px;text-align:center;">
          <p style="margin:0;color:#1e40af;font-size:15px;font-weight:700;">📅 New Appointment Booked</p>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px;">
          <p style="margin:0 0 20px;color:#374151;font-size:16px;">Dear <strong>Dr. ${appt.doctorName}</strong>,</p>
          <p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.7;">
            A new appointment has been confirmed for your schedule on MediShield AI.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="background:#1e40af;padding:14px 24px;"><span style="color:#fff;font-size:13px;font-weight:700;text-transform:uppercase;">Patient & Appointment</span></td></tr>
            <tr><td style="padding:24px;">
              <table width="100%" cellpadding="4">
                <tr><td style="color:#6b7280;font-size:13px;width:40%;">Patient Name</td><td style="color:#111827;font-weight:600;">${appt.patientName}</td></tr>
                <tr><td style="color:#6b7280;font-size:13px;">Phone</td><td style="color:#111827;">${appt.patientPhone}</td></tr>
                ${appt.patientEmail ? `<tr><td style="color:#6b7280;font-size:13px;">Email</td><td style="color:#111827;">${appt.patientEmail}</td></tr>` : ''}
                <tr><td style="color:#6b7280;font-size:13px;">Date</td><td style="color:#111827;font-weight:600;">${appt.date}</td></tr>
                <tr><td style="color:#6b7280;font-size:13px;">Time</td><td style="color:#111827;font-weight:600;">${appt.time}</td></tr>
                <tr><td style="color:#6b7280;font-size:13px;">Type</td><td style="color:#111827;text-transform:capitalize;">${appt.type}</td></tr>
                ${appt.note ? `<tr><td style="color:#6b7280;font-size:13px;">Note</td><td style="color:#111827;">${appt.note}</td></tr>` : ''}
              </table>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${baseUrl}?tab=schedule"
               style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:12px;">
              View Schedule →
            </a>
          </td></tr></table>
        </td>
      </tr>
      <tr>
        <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">MediShield AI • Pakistan's AI-Powered Healthcare Platform</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/**
 * sendAppointmentConfirmation(appointment)
 * Sends confirmation emails to both patient (if patientEmail provided) and doctor.
 */
async function sendAppointmentConfirmation(appt) {
  const smtp = getTransporter();
  if (!smtp) {
    console.warn('⚠️  Email not configured. Skipping appointment confirmation.');
    return;
  }

  const from = process.env.EMAIL_FROM || `"MediShield AI" <${process.env.EMAIL_USER}>`;
  const tasks = [];

  // Patient confirmation
  if (appt.patientEmail) {
    tasks.push(
      smtp.sendMail({
        from,
        to:      appt.patientEmail,
        subject: `[MediShield AI] Appointment Confirmed – ${appt.date} at ${appt.time} | ${appt.referenceNumber}`,
        html:    buildPatientConfirmationHtml(appt),
      }).then((info) => console.log(`✉️  Patient confirmation → ${appt.patientEmail} (${info.messageId})`))
    );
  }

  // Doctor notification
  const doctorTo = appt.doctorEmail || process.env.ADMIN_NOTIFY_EMAIL;
  if (doctorTo) {
    tasks.push(
      smtp.sendMail({
        from,
        to:      doctorTo,
        subject: `[MediShield AI] New Appointment – ${appt.patientName} on ${appt.date} at ${appt.time}`,
        html:    buildDoctorAppointmentHtml(appt),
      }).then((info) => console.log(`✉️  Doctor appointment email → ${doctorTo} (${info.messageId})`))
    );
  }

  await Promise.allSettled(tasks);
}

// ── Preparation tips per specialization ──────────────────────────────────────
const PREP_TIPS = {
  'Cardiologist':         ['Bring any previous ECG or echocardiogram reports', 'Note all current medications', 'Avoid caffeine 4 hours before'],
  'Gastroenterologist':   ['Fast for 4 hours if an endoscopy is possible', 'Note meal patterns and symptoms', 'Bring any blood/stool test reports'],
  'Orthopedic Surgeon':   ['Bring any X-rays or MRI scans', 'Wear loose comfortable clothing', 'Note when pain started and what worsens it'],
  'Neurologist':          ['Note the frequency and duration of symptoms', 'Avoid sleep deprivation before the visit', 'Bring any prior MRI or CT scan reports'],
  'Dermatologist':        ['Do not apply cream or makeup to affected area', 'Take photos if rash is intermittent', 'List all skincare products currently used'],
  'default':              ['Arrive 10 minutes early', 'Bring your CNIC or ID', 'List all current medications and allergies'],
};

function getPreparationTips(specialization = '') {
  return PREP_TIPS[specialization] || PREP_TIPS['default'];
}

// ── Reminder email (day before appointment) ───────────────────────────────────
function buildReminderHtml(appt) {
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  const icsUrl  = `${process.env.API_URL || 'http://localhost:5000'}/api/appointments/${appt._id}/calendar.ics`;
  const tips    = getPreparationTips(appt.doctorSpecialization);
  const tipsHtml = tips.map((t) => `<li style="padding:4px 0;color:#374151;font-size:14px;">${t}</li>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Appointment Reminder</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);padding:32px 40px;text-align:center;">
          <span style="color:#fff;font-size:22px;font-weight:800;">❤️ MediShield AI</span><br/>
          <span style="color:#bfdbfe;font-size:13px;">⏰ Appointment Reminder</span>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px;">
          <p style="color:#374151;font-size:16px;margin:0 0 16px;">Dear <strong>${appt.patientName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 24px;line-height:1.7;">
            This is a friendly reminder that you have an appointment tomorrow.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="background:#1e40af;padding:14px 24px;"><span style="color:#fff;font-size:13px;font-weight:700;text-transform:uppercase;">Appointment Details</span></td></tr>
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="4">
                <tr><td style="color:#6b7280;font-size:13px;width:40%;">Doctor</td><td style="color:#111827;font-weight:600;">Dr. ${appt.doctorName}</td></tr>
                <tr><td style="color:#6b7280;font-size:13px;">Date</td><td style="color:#111827;font-weight:600;">${appt.date}</td></tr>
                <tr><td style="color:#6b7280;font-size:13px;">Time</td><td style="color:#111827;font-weight:600;">${appt.time} (Pakistan Standard Time)</td></tr>
                <tr><td style="color:#6b7280;font-size:13px;">Type</td><td style="color:#111827;text-transform:capitalize;">${appt.type}</td></tr>
              </table>
            </td></tr>
          </table>
          <p style="color:#374151;font-size:14px;font-weight:700;margin:0 0 8px;">📋 Preparation Tips</p>
          <ul style="margin:0 0 28px;padding-left:20px;">${tipsHtml}</ul>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 12px;">
            <a href="${icsUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 32px;border-radius:12px;">
              📅 Add to Calendar
            </a>
          </td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${baseUrl}?tab=my-appointments" style="display:inline-block;background:#f8fafc;border:1px solid #e2e8f0;color:#374151;text-decoration:none;font-size:14px;font-weight:600;padding:12px 32px;border-radius:12px;">
              Manage Appointment
            </a>
          </td></tr></table>
        </td>
      </tr>
      <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">MediShield AI · Pakistan's AI-Powered Healthcare Platform</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Follow-up email (after appointment) ──────────────────────────────────────
function buildFollowupHtml(appt) {
  const baseUrl    = process.env.CLIENT_URL || 'http://localhost:3000';
  const feedbackUrl = `${baseUrl}?tab=feedback&appointmentId=${appt._id}`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>How Was Your Appointment?</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);padding:32px 40px;text-align:center;">
          <span style="color:#fff;font-size:22px;font-weight:800;">❤️ MediShield AI</span><br/>
          <span style="color:#bfdbfe;font-size:13px;">How was your visit?</span>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px;">
          <p style="color:#374151;font-size:16px;margin:0 0 16px;">Dear <strong>${appt.patientName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 24px;line-height:1.7;">
            We hope your appointment with <strong>Dr. ${appt.doctorName}</strong> went well.
            Your feedback helps other patients find the best care.
          </p>
          ${appt.doctorNote ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 6px;color:#1e40af;font-size:13px;font-weight:700;">📝 Note from Dr. ${appt.doctorName}</p>
              <p style="margin:0;color:#1e3a8a;font-size:14px;line-height:1.6;">${appt.doctorNote}</p>
            </td></tr>
          </table>` : ''}
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 16px;">
            <a href="${feedbackUrl}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:12px;">
              ⭐ Rate Your Experience
            </a>
          </td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${baseUrl}?tab=search" style="display:inline-block;background:#f8fafc;border:1px solid #e2e8f0;color:#374151;text-decoration:none;font-size:14px;font-weight:600;padding:12px 32px;border-radius:12px;">
              📅 Book Next Appointment
            </a>
          </td></tr></table>
        </td>
      </tr>
      <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">MediShield AI · Pakistan's AI-Powered Healthcare Platform</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Return-visit reminder email ───────────────────────────────────────────────
function buildReturnReminderHtml(appt) {
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Time for Your Follow-up</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#065f46 0%,#059669 100%);padding:32px 40px;text-align:center;">
          <span style="color:#fff;font-size:22px;font-weight:800;">❤️ MediShield AI</span><br/>
          <span style="color:#a7f3d0;font-size:13px;">📅 Time for Your Follow-up Visit</span>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px;">
          <p style="color:#374151;font-size:16px;margin:0 0 16px;">Dear <strong>${appt.patientName}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px;line-height:1.7;">
            <strong>Dr. ${appt.doctorName}</strong> recommended a follow-up visit around this time.
          </p>
          ${appt.doctorNote ? `<p style="color:#374151;font-size:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin:0 0 24px;line-height:1.6;">"${appt.doctorNote}"</p>` : ''}
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${baseUrl}?tab=search&q=${encodeURIComponent(appt.doctorSpecialization)}" style="display:inline-block;background:linear-gradient(135deg,#065f46,#059669);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:12px;">
              📅 Book Follow-up Appointment
            </a>
          </td></tr></table>
        </td>
      </tr>
      <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">MediShield AI · Pakistan's AI-Powered Healthcare Platform</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function sendReminderEmail(appt) {
  const smtp = getTransporter();
  if (!smtp) { console.warn('⚠️  Email not configured — skipping reminder.'); return; }
  if (!appt.patientEmail) return; // No email to send to
  const from = process.env.EMAIL_FROM || `"MediShield AI" <${process.env.EMAIL_USER}>`;
  const info = await smtp.sendMail({
    from,
    to:      appt.patientEmail,
    subject: `[MediShield AI] Reminder: Appointment tomorrow with Dr. ${appt.doctorName} at ${appt.time}`,
    html:    buildReminderHtml(appt),
  });
  console.log(`✉️  Reminder → ${appt.patientEmail} (${info.messageId})`);
}

async function sendFollowupEmail(appt) {
  const smtp = getTransporter();
  if (!smtp || !appt.patientEmail) return;
  const from = process.env.EMAIL_FROM || `"MediShield AI" <${process.env.EMAIL_USER}>`;
  const info = await smtp.sendMail({
    from,
    to:      appt.patientEmail,
    subject: `[MediShield AI] How was your appointment with Dr. ${appt.doctorName}?`,
    html:    buildFollowupHtml(appt),
  });
  console.log(`✉️  Follow-up → ${appt.patientEmail} (${info.messageId})`);
}

async function sendReturnReminderEmail(appt) {
  const smtp = getTransporter();
  if (!smtp || !appt.patientEmail) return;
  const from = process.env.EMAIL_FROM || `"MediShield AI" <${process.env.EMAIL_USER}>`;
  const info = await smtp.sendMail({
    from,
    to:      appt.patientEmail,
    subject: `[MediShield AI] Time for your follow-up with Dr. ${appt.doctorName}`,
    html:    buildReturnReminderHtml(appt),
  });
  console.log(`✉️  Return reminder → ${appt.patientEmail} (${info.messageId})`);
}

module.exports = {
  sendDoctorNotification,
  sendAppointmentConfirmation,
  sendReminderEmail,
  sendFollowupEmail,
  sendReturnReminderEmail,
};

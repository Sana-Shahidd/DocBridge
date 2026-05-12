# MediShield AI — Full Project Context

> **Purpose of this file:** Complete handoff document for any AI assistant (GPT, Claude, Gemini, etc.) picking up this codebase. Contains every architectural decision, schema, API contract, design convention, and deployment detail so you can continue development without reading every source file.

---

## 1. What is MediShield AI?

A Pakistani healthcare platform that lets patients:
1. **Search** for PMDC-registered doctors by symptom, specialization, city, fee, and consultation type using an AI scoring algorithm.
2. **Chat** with a doctor's AI proxy while they are offline (saves a lead; doctor is notified by email).
3. **Book appointments** on specific time slots the doctor has opened; receive a confirmation email.

Current deployment:
- **Frontend:** Vercel (React + Vite + Tailwind CSS)
- **Backend:** Render / Railway (Node.js + Express 4)
- **Database:** MongoDB Atlas (Mongoose ODM)
- **GitHub:** https://github.com/Sana-Shahidd/DocBridge

**No authentication system exists.** Patients are identified by phone number. Doctors are identified by MongoDB `_id`.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS (JIT), CSS modules only when Tailwind can't |
| Backend | Node.js 18+, Express 4, Mongoose 7 |
| Database | MongoDB Atlas (M0 free tier) |
| Email | Nodemailer (Gmail SMTP / App Password) |
| File upload | Multer (diskStorage, 5 MB, jpg/png/webp) |
| Deployment | Vercel (client) + Railway (server), `railway.json` in `server/` |

---

## 3. Repository Layout

```
synth_shield/
├── server/                        Express API
│   ├── models/
│   │   ├── Doctor.js
│   │   ├── ChatLog.js
│   │   ├── DoctorAvailability.js
│   │   └── Appointment.js
│   ├── routes/
│   │   ├── doctors.js
│   │   ├── chatlog.js
│   │   ├── availability.js        (mounted at /api/doctors/:id/availability)
│   │   └── appointments.js
│   ├── middleware/
│   │   └── upload.js
│   ├── utils/
│   │   └── mailer.js
│   ├── uploads/                   (git-ignored — doctor photos)
│   ├── server.js
│   ├── .env.example
│   └── railway.json
│
└── client/src/
    ├── api/
    │   ├── doctorApi.js
    │   ├── chatApi.js
    │   ├── appointmentApi.js
    │   └── symptomApi.js
    ├── components/
    │   ├── SymptomChecker.jsx           2-step AI symptom analysis UI
    │   ├── symptom/
    │   │   ├── BodyDiagram.jsx          SVG human silhouette (14 clickable zones)
    │   │   ├── AnalysisResult.jsx       Results card (specialization, urgency, conditions, tests)
    │   │   └── EmergencyAlert.jsx       Fullscreen red overlay for Emergency urgency level
    │   ├── DoctorRegistrationForm.jsx
    │   ├── DoctorProfileCard.jsx
    │   ├── booking/
    │   │   ├── BookingWizard.jsx
    │   │   ├── Step1Calendar.jsx
    │   │   ├── Step2Slots.jsx
    │   │   ├── Step3Details.jsx
    │   │   └── Step4Confirm.jsx
    │   ├── chat/
    │   │   ├── ChatWidget.jsx
    │   │   ├── MessageBubble.jsx
    │   │   └── TypingIndicator.jsx
    │   └── search/
    │       ├── SearchBar.jsx
    │       ├── FilterSidebar.jsx
    │       ├── DoctorSearchCard.jsx
    │       ├── SearchResults.jsx
    │       └── EmptyState.jsx
    ├── context/
    │   └── BookingContext.jsx
    ├── data/
    │   └── symptomMap.js
    ├── i18n/
    │   ├── translations.js
    │   └── LanguageContext.jsx
    ├── pages/
    │   ├── SearchPage.jsx
    │   ├── DoctorDashboard.jsx
    │   ├── DoctorAvailabilityPage.jsx
    │   ├── MyAppointmentsPage.jsx
    │   └── DoctorSchedulePage.jsx
    └── utils/
        ├── matchDoctors.js
        └── timeSlots.js
```

---

## 4. MongoDB Schemas

### Doctor
```js
{
  fullName:           String (required, trim)
  pmdcNumber:         String (required, unique, uppercase)
  specialization:     String (enum — 25 specializations)
  city:               String (enum — 18 Pakistani cities)
  consultationType:   'Online' | 'Physical' | 'Both'
  profilePhoto:       String (filename in /uploads/)
  hourlyFee:          Number (PKR, required)
  yearsOfExperience:  Number (default 0)
  bio:                String (max 500 chars)
  rating:             Number (default 0)
  totalReviews:       Number (default 0)
  isAvailable:        Boolean (default true) — simple on/off toggle
  isVerified:         Boolean (default false) — admin-verified PMDC
  email:              String (optional — used for email notifications)
}
```

### ChatLog
```js
{
  doctorId:        ObjectId (ref Doctor)
  doctorName:      String
  doctorEmail:     String
  patientName:     String (required)
  patientPhone:    String (required)
  symptoms:        String (required)
  referenceNumber: String (unique) — format MS-XXXX-XXXX
  status:          'pending' | 'contacted' (default pending)
  emailSent:       Boolean (default false)
}
// Indexes: { doctorId, createdAt }, { status }
```

### DoctorAvailability
```js
{
  doctorId: ObjectId (ref Doctor, required)
  date:     String "YYYY-MM-DD" (required)
  slots: [{
    time:     String "HH:MM" (09:00 → 20:30, every 30 min)
    isBooked: Boolean (default false)
  }]
}
// Unique compound index: { doctorId, date }
// No _id on slot subdocuments
```

**Key constraint:** When a doctor updates their slots via the PUT endpoint, any slot with `isBooked: true` is preserved even if the doctor did not include it in the new list. This prevents accidentally un-booking a confirmed patient.

### Appointment
```js
{
  // Doctor snapshot (denormalized — still works after doctor edits)
  doctorId:             ObjectId (ref Doctor, required)
  doctorName:           String (required)
  doctorSpecialization: String
  doctorEmail:          String
  doctorFee:            Number (required)

  // Patient
  patientName:  String (required)
  patientPhone: String (required)
  patientEmail: String (optional — used for confirmation email)

  // Booking
  date:            String "YYYY-MM-DD" (required)
  time:            String "HH:MM" (required)
  type:            'online' | 'physical' (required)
  note:            String (max 500)
  referenceNumber: String (unique, required) — format MS-XXXX-XXXX
  status:          'confirmed' | 'cancelled' | 'completed' (default confirmed)
  cancellationReason: String

  timestamps: true
}
// Indexes: { doctorId, date, time }, { patientPhone, date }
```

---

## 5. API Contracts

**Base URL:** `http://localhost:5000` (dev) / `VITE_API_URL` env var (prod)

### Doctor endpoints
```
POST   /api/doctors/register            Register doctor (multipart/form-data)
GET    /api/doctors                     List all doctors
GET    /api/doctors/:id                 Get single doctor
PUT    /api/doctors/:id/availability    Toggle isAvailable boolean (body: { isAvailable: bool })
```

### Availability slot endpoints
```
PUT  /api/doctors/:id/availability
  Body: { date: "YYYY-MM-DD", slots: ["09:00", "09:30", …] }
  Preserves isBooked:true slots doctor removed

GET  /api/doctors/:id/availability?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
  Returns: { availability: [{ date, totalSlots, availableSlots, slots }] }

GET  /api/doctors/:id/availability/:date
  Returns: { date, slots: [{ time, isBooked }] }
```

### Appointment endpoints
```
POST  /api/appointments
  Body: { doctorId, date, time, type, patientName, patientPhone, patientEmail?, note? }
  Returns 409 if slot already booked
  On success: marks DoctorAvailability slot isBooked:true, fires confirmation emails

GET   /api/appointments?patientPhone=03001234567
GET   /api/appointments?doctorId=<id>&date=YYYY-MM-DD
  Returns: { appointments: [...] }

PATCH /api/appointments/:id/cancel
  Body: { reason?: string }
  Returns 400 if appointment is <24 hours away
  On success: sets DoctorAvailability slot isBooked:false
```

### Chat log endpoints
```
POST  /api/chatlog          Save conversation log + fire email to doctor
GET   /api/chatlog?doctorId=<id>&status=pending
PATCH /api/chatlog/:id/status  Body: { status: "contacted" }
```

### Symptom Analysis
```
POST /api/analyze-symptoms
  Body: { symptoms: string, language: 'en'|'ur' }
  Returns: {
    success: true,
    analysis: {
      specialization:      string,
      urgencyLevel:        'Low'|'Medium'|'High'|'Emergency',
      possibleConditions:  [string] (max 3),
      recommendedTests:    [string] (max 3),
      warningSigns:        [string],
      urduSummary:         string (Urdu script)
    }
  }
  Model: claude-sonnet-4-6
  Errors: 400 (no/short symptoms), 429 (rate limit), 503 (key not configured)
```

### Health
```
GET /api/health  → { status: "OK", message, timestamp }
```

---

## 6. Frontend Architecture

### App shell (`client/src/App.jsx`)
Tab-based SPA. Tabs: `search`, `register`, `profile`, `dashboard`, `my-appointments`, `availability`, `schedule`.

Provider wrapping order (outermost first):
1. `LanguageProvider` — i18n context
2. `BookingProvider` — booking wizard state
3. `AppInner` — main layout
4. `BookingWizard` — rendered at root level as a portal-style overlay

### BookingContext (`context/BookingContext.jsx`)
```js
const { bookingDoctor, openBooking(doctor), closeBooking() } = useBooking();
```
`BookingWizard` reads `bookingDoctor`; if null, renders nothing. Any component can call `openBooking(doctor)` to trigger the wizard.

### Booking wizard flow
```
Step 1: Step1Calendar   — monthly calendar; dates with available slots highlighted blue
Step 2: Step2Slots      — time slot grid; booked = grey + strikethrough
Step 3: Step3Details    — patient form (name, phone, email?, type, note)
Step 4: Step4Confirm    — summary table + fee + "Confirm & Book" → POST /api/appointments
         → BookingSuccess screen with reference number
```

### Time slots
24 slots from 09:00 to 20:30 in 30-min increments. Defined in `utils/timeSlots.js`:
- `ALL_SLOTS` — array of "HH:MM" strings
- `formatSlot(time)` — converts "14:30" → "2:30 PM"
- `formatDate(dateStr)` — converts "2026-05-15" → "Fri, May 15, 2026"
- `toDateString(date)` — `Date` object → "YYYY-MM-DD"
- `todayString()` — today as "YYYY-MM-DD" (local, Pakistan-safe)

### AI matching algorithm (`utils/matchDoctors.js`)
```
score = keyword(0.4) + availability(0.3) + rating(0.2) + fee(0.1)
```
- Keyword: symptom → specialization mapping from `data/symptomMap.js` (90+ entries)
- Availability: `isAvailable` boolean
- Rating: normalized 0–1 against max rating in result set
- Fee: inverse normalization (lower fee = higher score)

Top 3 ranked doctors receive a gold "AI Recommended" badge.

### i18n
`LanguageContext` provides `{ lang, setLang, toggleLang, t, isUrdu }`.
`t('nav.findDoctor')` resolves via dot notation through `translations.js`.
`dir="rtl"` is applied to the document root when Urdu is active.

### ChatWidget state machine
7 phases: `idle → greeting → awaiting_consent → name → phone → symptoms → confirm → done/cancelled`
Typing delay: 500ms base + 8ms/char, capped at 2000ms.

---

## 7. Email System

`server/utils/mailer.js` exports:

### `sendDoctorNotification(options)`
Fired by `POST /api/chatlog`. Sends HTML email to doctor when patient leaves a chat message.
Fields: `doctorEmail, doctorName, patientName, patientPhone, symptoms, referenceNumber`.

### `sendAppointmentConfirmation(appointment)`
Fired by `POST /api/appointments` (fire-and-forget, doesn't block response).
Sends **two** emails using `Promise.allSettled`:
1. Patient confirmation (only if `patientEmail` is set)
2. Doctor notification (to `doctorEmail` or fallback `ADMIN_NOTIFY_EMAIL`)

Both are HTML emails with MediShield AI branding, appointment details table, and a CTA button.
All email sends are fire-and-forget — API returns before email completes.

---

## 8. Key Design Decisions

| Decision | Reason |
|---|---|
| Dates stored as "YYYY-MM-DD" strings | Avoids UTC+5 Pakistan timezone conversion bugs with JavaScript `Date` objects |
| Times stored as "HH:MM" strings | Same reason — no timezone math needed |
| No DB unique index on (doctorId, date, time) for conflicts | Route-level 409 check gives human-readable error messages |
| isBooked slots preserved on PUT availability | A doctor removing a slot shouldn't un-book a confirmed patient |
| No auth system | Not yet built; patientPhone is patient identifier; doctorId is doctor identifier |
| Doctor schema denormalized into Appointment | Dashboard still works correctly if doctor edits their profile after booking |
| `Promise.allSettled` for emails | One failing email doesn't prevent the other from sending |
| CORS allows both localhost:5173 and `CLIENT_URL` env var | Dev + prod without configuration changes |
| Multer diskStorage (not S3) | Simple for now; comment in `.gitignore` says to move to S3/Cloudinary for production |

---

## 9. Environment Variables

### `server/.env`
```
PORT=5000
MONGODB_URI=mongodb+srv://...
ANTHROPIC_API_KEY=sk-ant-...
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-16-char-app-password
EMAIL_FROM="MediShield AI" <your-gmail@gmail.com>
ADMIN_NOTIFY_EMAIL=fallback@example.com
CLIENT_URL=https://your-frontend.vercel.app
```

### `client/.env.local`
```
VITE_API_URL=http://localhost:5000
```
In production set `VITE_API_URL` to your Railway/Render API URL in Vercel environment variables.

---

## 10. Deployment

### Backend (Railway)
- `server/railway.json` configures Nixpacks builder, `node server.js` start command, healthcheck at `/api/health`.
- Set all env vars in Railway → Variables tab.
- Root directory for Railway service = `server/`.

### Frontend (Vercel)
- Vercel auto-detects Vite.
- Set `VITE_API_URL` in Vercel → Settings → Environment Variables.
- Root directory for Vercel project = `client/`.

### Current live URLs
- Frontend: https://github.com/Sana-Shahidd/DocBridge (Vercel)
- Backend: Render (URL not recorded here — check Railway/Render dashboard)

---

## 11. Conventions

- **Component files:** PascalCase `.jsx`
- **Utility/api files:** camelCase `.js`
- **Tailwind only** for styling; `.form-input`, `.btn-primary`, `.btn-outline`, `.card`, `.section-heading` utility classes defined in `client/src/index.css`.
- **No comments** on obvious code; only on non-obvious constraints/workarounds.
- **Error responses** always `{ success: false, message: "..." }`.
- **Success responses** always `{ success: true, <entity>: ... }`.
- **Reference numbers** format `MS-XXXX-XXXX` (random base-36 uppercase, unique-checked in loop).
- Imports: external libs → internal utils/api → components — no enforced linting yet.

---

## 12. What Has NOT Been Built Yet

- Doctor authentication (JWT login)
- Patient authentication
- Video consultations (WebRTC)
- Prescription PDF generator
- Payment integration (JazzCash/EasyPaisa/Stripe)
- Review and rating system (Doctor.rating is currently static)
- Push notifications
- Admin panel for PMDC verification
- Docker / CI/CD pipeline

---

## 13. Known Gotchas

- `DoctorAvailability` PUT route uses `{ upsert: true }` — always safe to call even if no doc exists yet.
- `Book` button is disabled when `doctor.isAvailable === false`. The availability slots system is separate: `isAvailable` is a manual on/off toggle; slots are per-date.
- The `availability` router uses `{ mergeParams: true }` because it's mounted at a nested path (`/api/doctors/:id/availability`).
- `DoctorAvailabilityPage` and `DoctorSchedulePage` require a Doctor `_id` to be entered manually (no auth yet). The App.jsx wrappers use a DOM input + `addEventListener('input')` pattern.
- ChatWidget uses a `phaseRef.current = phase` pattern to avoid stale closure bugs inside async typing-simulation callbacks.

---

*Generated: 2026-05-12 | MediShield AI v0.4 (Feature 4 complete)*

# MediShield AI – Development Progress

> **Pakistani AI-powered healthcare platform** connecting patients with verified PMDC-registered doctors.
> Stack: React · Vite · Tailwind CSS · Node.js · Express · MongoDB · Nodemailer

---

## ✅ Features Shipped

### Feature 1 — Doctor Registration & Profile System
**Status:** Complete | **Files:** `server/models/Doctor.js`, `server/routes/doctors.js`, `client/src/components/DoctorRegistrationForm.jsx`, `client/src/components/DoctorProfileCard.jsx`

| What was built | Details |
|---|---|
| Doctor registration form | Full Name, PMDC#, 25 specializations, 18 cities, consultation type, photo upload, fee (PKR), experience, 200-word bio |
| MongoDB Doctor schema | All profile fields + `rating`, `totalReviews`, `isAvailable`, `isVerified` (default false) |
| REST API | `POST /api/doctors/register`, `GET /api/doctors/:id`, `PUT /api/doctors/:id/availability`, `GET /api/doctors` |
| Profile card | Photo, name, specialization badge, city, availability dot (green/red), fee, star rating, Book + Chat buttons |
| Photo upload | Multer middleware, disk storage, 5 MB limit, JPG/PNG/WEBP only |

---

### Feature 2 — AI Doctor Search & Matching
**Status:** Complete | **Files:** `client/src/data/symptomMap.js`, `client/src/utils/matchDoctors.js`, `client/src/components/search/`

| What was built | Details |
|---|---|
| Symptom → specialization map | 90+ entries (chest pain → Cardiologist, skin rash → Dermatologist, etc.) |
| Debounced SearchBar | 300ms debounce, keyboard-navigable autocomplete dropdown, specialization pills |
| Filter sidebar | City dropdown (18 cities), consultation type pills, dual-range fee slider (0–10 000 PKR), availability toggle |
| AI matching algorithm | 40% keyword · 30% availability · 20% rating · 10% fee preference → sorted top 20 |
| SearchResults | Loading skeletons, count header, "Sort by relevance" indicator |
| AI Recommended badge | Gold badge on rank 1–3 with match score bar |
| Empty state | "No doctors found" + `findClosestMatch()` surfaces nearest available specialist |
| i18n | English + Urdu translations via `LanguageContext`, auto `dir="rtl"` for Urdu |
| Quick-search pills | Pre-filled searches: chest pain, diabetes, headache, etc. |

---

### Feature 3 — AI Chatbot (Doctor Proxy)
**Status:** Complete | **Files:** `server/models/ChatLog.js`, `server/routes/chatlog.js`, `server/utils/mailer.js`, `client/src/components/chat/`

| What was built | Details |
|---|---|
| ChatWidget | WhatsApp-style, fixed bottom-right, slide-up animation, 380 × 560 px |
| State machine | 7 phases: idle → greeting → awaiting_consent → name → phone → symptoms → confirm → done/cancelled |
| Typing indicator | 3-dot bounce animation, delay = 500ms + 8ms/char (capped 2s) per bot message |
| Message bubbles | Bot: white/left, User: blue/right, bold/italic markdown, double-tick timestamps |
| Quick-reply buttons | "Yes, please help" / "No, thanks" at consent; "Yes, send it!" / "No, cancel" at confirm |
| ChatLog MongoDB schema | doctorId, patientName, patientPhone, symptoms, referenceNumber (MS-XXXX-XXXX), status, emailSent |
| REST API | `POST /api/chatlog`, `GET /api/chatlog[?doctorId=&status=]`, `PATCH /api/chatlog/:id/status` |
| Email notification | Nodemailer HTML email to doctor: patient details, reference#, "View Dashboard" button |
| Doctor Dashboard | Table: patient, WhatsApp link, symptoms, doctor, timestamp, status toggle, reference # |
| Dashboard stats | Total / Pending / Contacted stat cards |
| Status toggle | Click badge to switch pending ↔ contacted (instant optimistic update) |
| Chat on Search cards | "Chat" button on every DoctorSearchCard and DoctorProfileCard |

---

### Feature 4 — Appointment Booking System
**Status:** Complete | **Files:** see full list in Project Structure below

| What was built | Details |
|---|---|
| DoctorAvailability MongoDB schema | Per doctor per date; slots array `{ time, isBooked }`; unique index `{ doctorId, date }` |
| Appointment MongoDB schema | Full booking record: doctorId snapshot, patient info, date/time, type, referenceNumber, status |
| Availability API | `PUT /api/doctors/:id/availability` (upsert; preserves booked slots), `GET` with date range, `GET /:date` |
| Appointments API | `POST /api/appointments` (conflict check → 409), `GET` by patientPhone or doctorId, `PATCH /:id/cancel` |
| 24-hour cancel rule | Cancel rejected if appointment is <24 hours away |
| Confirmation emails | Nodemailer HTML emails to patient (if email provided) and doctor on every booking |
| BookingContext | React context at App root so any component can call `openBooking(doctor)` |
| BookingWizard | Full-screen overlay, 4-step stepper with progress indicator |
| Step 1 — Calendar | Monthly calendar, highlights dates with available slots (fetched from API) |
| Step 2 — Slot picker | Time slot grid, booked slots struck-through + disabled |
| Step 3 — Patient details | Name, phone, optional email, appointment type (online/physical), note |
| Step 4 — Confirm | Summary table, fee display, "Confirm & Book" → POST to API |
| Success screen | Reference number display, close wizard |
| DoctorAvailabilityPage | 7-day weekly grid, 30-min slots toggles, Select All / Clear All, Save button |
| MyAppointmentsPage | Phone-number lookup, Upcoming / Past tabs, Cancel button (only if >24hr), cancel modal |
| DoctorSchedulePage | Day-by-day navigator, stats bar (Confirmed/Completed/Cancelled), timeline, click for detail modal |
| Book buttons wired | DoctorProfileCard and DoctorSearchCard both call `openBooking(doctor)` |
| CORS update | `server.js` CORS now allows both localhost:5173 and `CLIENT_URL` env variable |

---

### Feature 5 — NLP Symptom Analysis Engine
**Status:** Complete | **Files:** `server/routes/symptoms.js`, `client/src/components/SymptomChecker.jsx`, `client/src/components/symptom/`

| What was built | Details |
|---|---|
| Claude API integration | `POST /api/analyze-symptoms` calls `claude-sonnet-4-6` with structured triage prompt |
| Structured AI response | Returns `{ specialization, urgencyLevel, possibleConditions, recommendedTests, warningSigns, urduSummary }` |
| Urgency levels | Low (blue) / Medium (yellow) / High (orange) / Emergency (red, pulsing + `animate-ping`) |
| Emergency overlay | Fullscreen red alert with 1122 tap-to-call link, Rescue 115, and Poison Control 1166 |
| SymptomChecker 2-step flow | Step 1: textarea + language toggle + body diagram → Step 2: AI results card |
| Interactive body diagram | SVG human silhouette, 14 clickable zones, tooltip on hover, selected pills shown below |
| Language auto-detection | Detects Urdu Unicode range (U+0600–U+06FF); manual override toggle |
| `rtl` textarea support | Textarea switches to `dir=rtl` + `.font-urdu` class when Urdu detected |
| AnalysisResult card | Specialization hero with emoji icon, urgency banner, conditions (with disclaimer), tests, warnings |
| Urdu summary | AI-generated Urdu script summary displayed `dir=rtl` |
| "Find Doctors" CTA | Switches to search tab with specialization pre-filled via `searchSeed` state in App.jsx |
| Medical disclaimer | Displayed on Step 1 and Step 2 |
| Rate limit / error handling | 429/401 errors translated to user-friendly messages |
| Primary entry point | `symptoms` is now the default tab on app load |

---

### Feature 6 — Waiting Time Prediction
**Status:** Complete | **Files:** `server/routes/doctors.js` (extended), `client/src/api/waitTimeApi.js`, `client/src/components/WaitTimeBadge.jsx`, `client/src/components/AlternativeDoctorBanner.jsx`, `client/src/components/DoctorAvailabilityMini.jsx`

| What was built | Details |
|---|---|
| `GET /api/doctors/:id/next-available` | Scans DoctorAvailability docs sorted by date, returns `{ nextAvailable ISO, waitHours, slotsAvailableToday, alternativeDoctors[2] }` |
| `GET /api/doctors/availability-summary` | Per-doctor booking rate for the current week + next free slot |
| `WaitTimeBadge` | Colored badge: green "Available Now" (<3hr), blue "Today at HH:MM" (<24hr), yellow "Tomorrow at HH:MM" (<48hr), orange "N days wait" (≥48hr) |
| `AlternativeDoctorBanner` | Slide-in suggestion when wait >48hr — shows faster alternative doctor with "Switch" button (calls BookingContext) |
| `DoctorAvailabilityMini` | 7-day dot calendar: green (≥50% slots open), yellow (partial), red (fully booked), gray (no slots set) |
| Client-side cache | 5-minute TTL Map in `waitTimeApi.js` — prevents N API calls for N search result cards |
| `DoctorProfileCard` updated | Added `WaitTimeBadge`, `DoctorAvailabilityMini`, `AlternativeDoctorBanner` |
| `DoctorSearchCard` updated | Added `WaitTimeBadge` |

---

### Feature 7 — Automated Follow-up & Reminder System
**Status:** Complete | **Files:** `server/models/Appointment.js` (extended), `server/models/Review.js`, `server/routes/reviews.js`, `server/routes/appointments.js` (extended), `server/jobs/reminderJob.js`, `server/utils/mailer.js` (extended), `client/src/api/reviewApi.js`, `client/src/pages/FeedbackPage.jsx`, `client/src/components/RemindersPanel.jsx`, `client/src/pages/DoctorDashboard.jsx` (extended)

| What was built | Details |
|---|---|
| Appointment schema extended | Added `reminderSent`, `followupSent`, `doctorNote`, `returnInDays`, `returnReminderDate`, `returnReminderSent` |
| Review model | `appointmentId` (unique), `doctorId`, `patientName/Phone`, `ratings { punctuality, communication, diagnosis, overall }`, `feedback` — submitting recomputes `Doctor.rating` |
| `POST /api/reviews` | Validates ratings 1–5, prevents duplicate (409), creates review, updates doctor avg rating |
| `GET /api/reviews` | Supports `?doctorId=` and `?appointmentId=` |
| `POST /api/appointments/:id/followup-note` | Doctor adds clinical note + return-in-days; computes `returnReminderDate` in PKT |
| `GET /api/appointments/:id/calendar.ics` | ICS calendar file download with `TZID=Asia/Karachi` |
| node-cron jobs (hourly) | (1) day-before appointment reminder email, (2) auto-complete past confirmed → follow-up email with review link, (3) return-visit reminder emails |
| Cron startup catch-up | 5-second `setTimeout` on server start runs `checkFollowups` and `checkReturnReminders` to catch missed appointments |
| Email templates | `buildReminderHtml` (prep tips + ICS), `buildFollowupHtml` (doctor note + "Rate Your Experience" link), `buildReturnReminderHtml` (green-themed follow-up) |
| `FeedbackPage` | 4-category star picker (punctuality/communication/diagnosis/overall), text feedback, duplicate check, success + already-reviewed states |
| `RemindersPanel` | Patient sidebar showing: amber cards (follow-up due), blue cards (upcoming appointments), gray cards (recent completed), "Book Now" button |
| `DoctorDashboard` updated | Added "Doctor Notes" panel tab — loads completed appointments for a doctor, inline note textarea + return-visit dropdown, saves via `addFollowupNote` |
| `App.jsx` updated | Added `feedback` tab (reads `?tab=feedback&appointmentId=` from URL), `RemindersPanel` sidebar in My Appointments view, URL-based appointment pre-fill |

---

## 📋 Roadmap — Next Features to Build

| Priority | Feature | Notes |
|---|---|---|
| ✅ Done | NLP Symptom Analysis | Feature 5 — Claude-powered triage with body diagram |
| ✅ Done | Waiting Time Prediction | Feature 6 — next-available API, WaitTimeBadge, AlternativeDoctorBanner |
| ✅ Done | Follow-up & Reminder System | Feature 7 — cron jobs, reviews, FeedbackPage, RemindersPanel |
| 🔴 High | Doctor authentication | JWT login so doctors manage their own profiles and availability |
| 🔴 High | Patient authentication | Account creation, medical history, appointment history |
| 🟡 Medium | Video consultation (WebRTC) | In-app video calls between patient and doctor |
| 🟡 Medium | Prescription generator | PDF prescription with doctor signature |
| 🟢 Low | Payment integration | JazzCash / EasyPaisa / Stripe for consultation fees |
| 🟢 Low | Push notifications | Browser + PWA notifications for new bookings |
| 🟢 Low | Admin panel | PMDC verification, doctor management, platform stats |

---

## 🚀 Deployment Guide

### Option A — Railway + Vercel (Recommended)

Railway auto-deploys on every `git push`. You need two services: **API** and **Web**.

#### Prerequisites
1. [Create a Railway account](https://railway.app) (free tier available)
2. [Create a MongoDB Atlas cluster](https://cloud.mongodb.com) (free M0 tier)
3. Push this repo to GitHub

#### Step 1 — Deploy the backend API

```bash
# In Railway dashboard → New Project → Deploy from GitHub repo
# Select the repo, then set Root Directory = server
```

Set these environment variables in Railway → Variables:
```
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/medishield_ai
PORT=5000
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-16-char-app-password
EMAIL_FROM="MediShield AI" <your-gmail@gmail.com>
ADMIN_NOTIFY_EMAIL=doctor@example.com
CLIENT_URL=https://your-frontend.vercel.app
```

#### Step 2 — Deploy the frontend

```bash
cd client
vercel --prod
# Set VITE_API_URL=https://your-api.railway.app in Vercel env variables
```

#### Step 3 — Enable auto-deploy

Railway and Vercel both watch your GitHub repo by default.
Every `git push main` → automatic redeploy within ~2 minutes.

---

### Local development

```bash
# Terminal 1 — Backend
cd server
cp .env.example .env   # fill in your values
npm install
npm run dev            # http://localhost:5000

# Terminal 2 — Frontend
cd client
npm install
npm run dev            # http://localhost:5173
```

---

## 🔑 Environment Variables Reference

### Server (`server/.env`)

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | API port (default 5000) |
| `MONGODB_URI` | **Yes** | MongoDB connection string |
| `EMAIL_HOST` | No | SMTP host (default smtp.gmail.com) |
| `EMAIL_PORT` | No | SMTP port (default 587) |
| `EMAIL_USER` | No | SMTP username / Gmail address |
| `EMAIL_PASS` | No | Gmail App Password (16 chars) |
| `EMAIL_FROM` | No | From name + address in sent emails |
| `ADMIN_NOTIFY_EMAIL` | No | Fallback if doctor has no email |
| `CLIENT_URL` | No | Frontend URL — used in CORS and email links |

---

## 📡 API Reference

### Doctors
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/doctors/register` | Register doctor (multipart/form-data) |
| `GET` | `/api/doctors` | List all doctors |
| `GET` | `/api/doctors/:id` | Get doctor profile |
| `PUT` | `/api/doctors/:id/availability` | Set `isAvailable` boolean |

### Doctor Availability Slots
| Method | Endpoint | Description |
|---|---|---|
| `PUT` | `/api/doctors/:id/availability` | Upsert time slots for one date |
| `GET` | `/api/doctors/:id/availability` | All availability (`?startDate=&endDate=`) |
| `GET` | `/api/doctors/:id/availability/:date` | Slot list for one date |

### Appointments
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/appointments` | Book appointment (conflict check included) |
| `GET` | `/api/appointments?patientPhone=` | Patient's appointments |
| `GET` | `/api/appointments?doctorId=&date=` | Doctor's schedule |
| `PATCH` | `/api/appointments/:id/cancel` | Cancel (>24hr rule enforced) |

### Chat Logs
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chatlog` | Save patient conversation |
| `GET` | `/api/chatlog` | List all logs (`?doctorId=` / `?status=`) |
| `PATCH` | `/api/chatlog/:id/status` | Toggle pending ↔ contacted |

### System
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |

---

## 🗂 Project Structure

```
synth_shield/
├── server/                        Node.js + Express API
│   ├── models/
│   │   ├── Doctor.js              Doctor schema (25 specs, 18 cities)
│   │   ├── ChatLog.js             Patient chatbot conversation log
│   │   ├── DoctorAvailability.js  Per-doctor per-date slot availability
│   │   └── Appointment.js         Full booking record
│   ├── routes/
│   │   ├── doctors.js             Doctor CRUD endpoints
│   │   ├── chatlog.js             Chat log endpoints
│   │   ├── availability.js        Slot availability endpoints
│   │   └── appointments.js        Booking endpoints
│   ├── middleware/
│   │   └── upload.js              Multer photo upload
│   ├── utils/
│   │   └── mailer.js              Nodemailer (chatlog + appointment emails)
│   ├── uploads/                   Saved doctor photos (git-ignored)
│   ├── server.js                  Express entry point
│   └── .env.example               Environment variable template
│
└── client/                        React + Vite + Tailwind frontend
    └── src/
        ├── api/
        │   ├── doctorApi.js       Doctor API helpers
        │   ├── chatApi.js         Chat log API helpers
        │   └── appointmentApi.js  Availability + appointment API helpers
        ├── components/
        │   ├── DoctorRegistrationForm.jsx
        │   ├── DoctorProfileCard.jsx       (Book button → BookingContext)
        │   ├── booking/
        │   │   ├── BookingWizard.jsx       4-step full-screen overlay
        │   │   ├── Step1Calendar.jsx       Monthly calendar
        │   │   ├── Step2Slots.jsx          Time slot grid
        │   │   ├── Step3Details.jsx        Patient info form
        │   │   └── Step4Confirm.jsx        Summary + confirm + success
        │   ├── chat/
        │   │   ├── ChatWidget.jsx          AI chatbot widget (state machine)
        │   │   ├── MessageBubble.jsx       Bot/user chat bubbles
        │   │   └── TypingIndicator.jsx     Animated dots
        │   └── search/
        │       ├── SearchBar.jsx           Debounced autocomplete
        │       ├── FilterSidebar.jsx       Dual-range slider + filters
        │       ├── DoctorSearchCard.jsx    (Book button → BookingContext)
        │       ├── SearchResults.jsx
        │       └── EmptyState.jsx
        ├── context/
        │   └── BookingContext.jsx         openBooking() / closeBooking()
        ├── data/
        │   └── symptomMap.js             90+ symptom → specialization entries
        ├── i18n/
        │   ├── translations.js           EN + UR strings
        │   └── LanguageContext.jsx       useLanguage() hook, dir="rtl"
        ├── pages/
        │   ├── SearchPage.jsx            AI search orchestrator
        │   ├── DoctorDashboard.jsx       Chat log dashboard table
        │   ├── DoctorAvailabilityPage.jsx 7-day slot manager (doctor side)
        │   ├── MyAppointmentsPage.jsx    Patient appointment history
        │   └── DoctorSchedulePage.jsx   Doctor daily timeline
        └── utils/
            ├── matchDoctors.js          AI scoring algorithm
            └── timeSlots.js            ALL_SLOTS, formatSlot(), formatDate()
```

---

*Last updated: 2026-05-12*

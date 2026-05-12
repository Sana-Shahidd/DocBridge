# MediShield AI – Doctor Profile System

Full-stack Pakistani medical app with doctor registration, profile cards, and availability management.

**Stack:** React + Vite · Node.js + Express · MongoDB + Mongoose · Tailwind CSS

---

## Project Structure

```
medishield-ai/
├── server/                   Express API
│   ├── server.js             Entry point
│   ├── models/Doctor.js      Mongoose schema
│   ├── routes/doctors.js     REST endpoints
│   ├── middleware/upload.js  Multer photo upload
│   └── uploads/              Saved profile photos (git-ignored)
└── client/                   React frontend
    ├── src/
    │   ├── App.jsx
    │   ├── api/doctorApi.js
    │   └── components/
    │       ├── DoctorRegistrationForm.jsx
    │       └── DoctorProfileCard.jsx
    └── ...config files
```

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- MongoDB running locally (`mongod`) **or** a MongoDB Atlas connection string

### 2. Backend

```bash
cd server
cp .env.example .env          # set MONGODB_URI if needed
npm install
npm run dev                   # starts on http://localhost:5000
```

### 3. Frontend

```bash
cd client
npm install
npm run dev                   # starts on http://localhost:3000
```

Open **http://localhost:3000** in your browser.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/doctors/register` | Register a doctor (multipart/form-data) |
| `GET` | `/api/doctors` | List all doctors |
| `GET` | `/api/doctors/:id` | Fetch single doctor profile |
| `PUT` | `/api/doctors/:id/availability` | Set `isAvailable` true/false |
| `GET` | `/api/health` | Health check |

### Register request fields (multipart/form-data)

| Field | Type | Required |
|-------|------|----------|
| fullName | string | ✅ |
| pmdcNumber | string | ✅ |
| specialization | enum (25 options) | ✅ |
| city | enum (18 cities) | ✅ |
| consultationType | Online / Physical / Both | ✅ |
| hourlyFee | number (PKR) | ✅ |
| yearsOfExperience | number | ✅ |
| bio | string (max 200 words) | ✅ |
| profilePhoto | file (jpg/png/webp, max 5 MB) | optional |

---

## Features

- **Registration form** with client-side + server-side validation
- **Photo upload** with live preview (Multer, served as static)
- **25 specializations** + **18 Pakistani cities** in dropdowns
- **Profile card** with availability dot, star rating, fee, badges
- **Availability toggle** updates via `PUT /api/doctors/:id/availability`
- **PMDC verified badge** shown when `isVerified: true`
- Responsive Tailwind CSS — blue/white medical aesthetic

// ─────────────────────────────────────────────────────────────────────────────
// App.jsx – MediShield AI Root Component
//
// Three-tab layout:
//   "Find Doctor"     – AI-powered search & matching (SearchPage)
//   "Register Doctor" – DoctorRegistrationForm; on success shows the new card
//   "View Profile"    – lookup any doctor by MongoDB _id
//
// Wrapped in LanguageProvider so all children can call useLanguage().
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { BookingProvider } from './context/BookingContext';
import BookingWizard from './components/booking/BookingWizard';
import SymptomChecker from './components/SymptomChecker';
import DoctorRegistrationForm from './components/DoctorRegistrationForm';
import DoctorProfileCard from './components/DoctorProfileCard';
import SearchPage from './pages/SearchPage';
import DoctorDashboard from './pages/DoctorDashboard';
import DoctorAvailabilityPage from './pages/DoctorAvailabilityPage';
import DoctorSchedulePage from './pages/DoctorSchedulePage';
import MyAppointmentsPage from './pages/MyAppointmentsPage';
import FeedbackPage from './pages/FeedbackPage';
import RemindersPanel from './components/RemindersPanel';
import { getDoctorById } from './api/doctorApi';

// ── Feature list item ─────────────────────────────────────────────────────────
function Feature({ text }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-gray-600">
      <svg className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd" />
      </svg>
      {text}
    </li>
  );
}

// ── Inner App (uses useLanguage, so must be inside LanguageProvider) ──────────
function AppInner() {
  const { t, toggleLang, lang } = useLanguage();

  // Active tab — 'symptoms' is the default patient-facing entry point
  const [activeTab, setActiveTab] = useState('symptoms');

  // Query seed injected when "Find Doctors" is clicked from SymptomChecker
  const [searchSeed, setSearchSeed] = useState('');

  // Feedback: appointmentId from URL ?appointmentId=xxx&tab=feedback
  const [feedbackAppointmentId, setFeedbackAppointmentId] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const apptId = params.get('appointmentId');
    if (tab === 'feedback') {
      setActiveTab('feedback');
      if (apptId) setFeedbackAppointmentId(apptId);
    }
  }, []);

  // Registration + profile tab state
  const [registeredDoctor, setRegisteredDoctor] = useState(null);
  const [fetchedDoctor,    setFetchedDoctor]    = useState(null);
  const [lookupId,         setLookupId]         = useState('');
  const [lookupError,      setLookupError]      = useState('');
  const [lookupLoading,    setLookupLoading]    = useState(false);

  const handleRegistrationSuccess = (doctor) => {
    setRegisteredDoctor(doctor);
    setFetchedDoctor(null);
    setActiveTab('profile');
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    setLookupError('');
    if (!lookupId.trim()) return;
    setLookupLoading(true);
    try {
      const result = await getDoctorById(lookupId.trim());
      setFetchedDoctor(result.doctor);
    } catch (err) {
      setLookupError(err.response?.data?.message || 'Doctor not found.');
    } finally {
      setLookupLoading(false);
    }
  };

  const displayDoctor = fetchedDoctor || registeredDoctor;

  function handleFindDoctors(specialization) {
    setSearchSeed(specialization);
    setActiveTab('search');
  }

  // Tab definitions — symptoms first as primary patient entry
  const tabs = [
    { id: 'symptoms',         icon: 'symptom',      label: 'Symptom Check'        },
    { id: 'search',           icon: 'search',       label: t('nav.findDoctor')    },
    { id: 'register',         icon: 'plus',         label: t('nav.register')      },
    { id: 'profile',          icon: 'user',         label: t('nav.viewProfile')   },
    { id: 'dashboard',        icon: 'dashboard',    label: 'Dashboard'            },
    { id: 'my-appointments',  icon: 'calendar',     label: 'My Appointments'      },
    { id: 'feedback',         icon: 'star',         label: 'Rate Visit'           },
    { id: 'availability',     icon: 'clock',        label: 'Set Availability'     },
    { id: 'schedule',         icon: 'list',         label: 'Schedule'             },
  ];

  // Icons for tab buttons
  const TabIcon = ({ type }) => {
    if (type === 'search') return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    );
    if (type === 'plus') return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    );
    if (type === 'dashboard') return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    );
    if (type === 'symptom') return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    );
    if (type === 'calendar') return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
    if (type === 'clock') return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
    if (type === 'list') return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    );
    if (type === 'star') return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    );
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    );
  };

  return (
    <div className="min-h-screen">

      {/* ════════════════════════════════════════════════════════════════════
          SITE HEADER – shown on Register & Profile tabs only
          (SearchPage has its own hero, so we hide the plain header there)
      ════════════════════════════════════════════════════════════════════ */}
      <header className="bg-white/90 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

          {/* Brand */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div className="hidden sm:block">
              <span className="text-lg font-extrabold text-primary-900 tracking-tight">MediShield AI</span>
            </div>
          </div>

          {/* Tab navigation */}
          <nav className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold
                  whitespace-nowrap transition-all duration-150
                  ${activeTab === tab.id
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'}`}
              >
                <TabIcon type={tab.icon} />
                <span className="hidden sm:inline">{tab.label}</span>
                {/* Dot indicator */}
                {tab.id === 'profile' && registeredDoctor && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                )}
              </button>
            ))}
          </nav>

          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="flex-shrink-0 text-xs font-bold border border-gray-300 text-gray-600
                       hover:border-primary-400 hover:text-primary-700 px-3 py-1.5 rounded-lg
                       transition-all duration-150"
          >
            {t('nav.langSwitch')}
          </button>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════════
          TAB CONTENT
      ════════════════════════════════════════════════════════════════════ */}

      {/* ── SYMPTOM CHECKER TAB ─────────────────────────────────────────── */}
      {activeTab === 'symptoms' && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10
                        bg-gradient-to-br from-slate-50 via-blue-50 to-primary-50 min-h-[calc(100vh-4rem)]">
          <SymptomChecker onFindDoctors={handleFindDoctors} />
        </div>
      )}

      {/* ── SEARCH TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'search' && <SearchPage initialQuery={searchSeed} />}

      {/* ── DASHBOARD TAB ───────────────────────────────────────────────── */}
      {activeTab === 'dashboard' && <DoctorDashboard />}

      {/* ── MY APPOINTMENTS TAB ─────────────────────────────────────────── */}
      {activeTab === 'my-appointments' && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6
                        bg-gradient-to-br from-slate-50 via-blue-50 to-primary-50 min-h-[calc(100vh-4rem)]">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2">
              <MyAppointmentsPage />
            </div>
            <aside>
              <RemindersPanel onBookNow={handleFindDoctors} />
            </aside>
          </div>
        </div>
      )}

      {/* ── FEEDBACK TAB ────────────────────────────────────────────────── */}
      {activeTab === 'feedback' && (
        <FeedbackPage appointmentId={feedbackAppointmentId || undefined} />
      )}

      {/* ── AVAILABILITY TAB ────────────────────────────────────────────── */}
      {activeTab === 'availability' && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Doctor ID</label>
            <input
              type="text"
              id="avail-doctor-id"
              placeholder="Paste Doctor MongoDB _id"
              className="form-input max-w-sm font-mono text-xs"
              onChange={(e) => {
                window.__availDoctorId = e.target.value.trim();
              }}
            />
          </div>
          <AvailabilityTabWrapper />
        </div>
      )}

      {/* ── SCHEDULE TAB ────────────────────────────────────────────────── */}
      {activeTab === 'schedule' && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Doctor ID</label>
            <input
              type="text"
              id="schedule-doctor-id"
              placeholder="Paste Doctor MongoDB _id"
              className="form-input max-w-sm font-mono text-xs"
              onChange={(e) => {
                window.__scheduleDoctorId = e.target.value.trim();
              }}
            />
          </div>
          <ScheduleTabWrapper />
        </div>
      )}

      {/* ── REGISTER TAB ────────────────────────────────────────────────── */}
      {activeTab === 'register' && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10
                        bg-gradient-to-br from-slate-50 via-blue-50 to-primary-50 min-h-[calc(100vh-4rem)]">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-2">
              <DoctorRegistrationForm onSuccess={handleRegistrationSuccess} />
            </div>
            <aside className="space-y-5">
              <div className="card">
                <h3 className="font-bold text-gray-900 mb-4">Why join MediShield AI?</h3>
                <ul className="space-y-3">
                  <Feature text="Reach patients across 18+ Pakistani cities" />
                  <Feature text="Offer online video or in-person consultations" />
                  <Feature text="AI-assisted scheduling & reminders" />
                  <Feature text="Secure digital patient records" />
                  <Feature text="Transparent PKR fee structure" />
                  <Feature text="PMDC verification badge builds patient trust" />
                </ul>
              </div>
              <div className="bg-gradient-to-br from-primary-700 to-primary-500 rounded-2xl p-6 text-white">
                <p className="text-sm font-semibold opacity-80 mb-5 uppercase tracking-wide">
                  Platform at a glance
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { v: '2,400+', l: 'Registered Doctors' },
                    { v: '18',     l: 'Cities Covered'     },
                    { v: '95k+',   l: 'Patients Served'    },
                    { v: '4.8★',   l: 'Avg. Doctor Rating' },
                  ].map((s) => (
                    <div key={s.l} className="text-center">
                      <p className="text-2xl font-extrabold">{s.v}</p>
                      <p className="text-xs opacity-70 mt-0.5">{s.l}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Profile stays <strong>pending</strong> until our team verifies your PMDC credentials (1–2 business days).
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* ── PROFILE TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10
                        bg-gradient-to-br from-slate-50 via-blue-50 to-primary-50 min-h-[calc(100vh-4rem)]">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <aside className="space-y-5">
              <div className="card">
                <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Find a Doctor
                </h2>
                <form onSubmit={handleLookup}>
                  <label className="form-label">Doctor ID</label>
                  <input
                    type="text" value={lookupId}
                    onChange={(e) => { setLookupId(e.target.value); setLookupError(''); }}
                    placeholder="Paste MongoDB ObjectId..."
                    className="form-input mb-3 font-mono text-xs"
                  />
                  {lookupError && <p className="text-xs text-red-500 mb-3">{lookupError}</p>}
                  <button type="submit" disabled={lookupLoading || !lookupId.trim()} className="btn-primary w-full text-sm">
                    {lookupLoading ? 'Searching...' : 'Fetch Profile'}
                  </button>
                </form>
              </div>
              {registeredDoctor && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm font-semibold text-green-800">Registration successful!</p>
                  </div>
                  <p className="text-xs text-green-700 font-medium mb-1">Doctor ID:</p>
                  <p className="text-xs text-green-600 font-mono break-all bg-green-100 p-2 rounded-lg">
                    {registeredDoctor._id}
                  </p>
                  {fetchedDoctor && (
                    <button onClick={() => setFetchedDoctor(null)}
                      className="mt-3 text-xs text-primary-600 hover:text-primary-800 font-medium">
                      ← Back to registered doctor
                    </button>
                  )}
                </div>
              )}
            </aside>
            <div className="lg:col-span-2 flex flex-col items-center lg:items-start">
              {displayDoctor ? (
                <>
                  <p className="text-xs font-medium text-gray-400 mb-4 uppercase tracking-widest self-start">
                    {fetchedDoctor ? 'Fetched Profile' : 'Just Registered'}
                  </p>
                  <DoctorProfileCard doctor={displayDoctor} showAvailabilityToggle />
                </>
              ) : (
                <div className="flex flex-col items-center text-center text-gray-400 py-24 w-full">
                  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                    <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-500">No profile loaded yet</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs">Register a doctor or enter a Doctor ID to see the profile card.</p>
                  <button onClick={() => setActiveTab('register')} className="mt-4 text-sm font-medium text-primary-600 hover:underline">
                    Register a doctor →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row
                        items-center justify-between gap-2 text-xs text-gray-400">
          <p>© 2024 MediShield AI · Pakistan's Trusted AI Healthcare Platform</p>
          <p>Built for PMDC-registered doctors across Pakistan</p>
        </div>
      </footer>
    </div>
  );
}

// ── Thin wrappers that re-render when doctor id input changes ─────────────────
function AvailabilityTabWrapper() {
  const [doctorId, setDoctorId] = useState('');
  useEffect(() => {
    const el = document.getElementById('avail-doctor-id');
    if (!el) return;
    const handler = () => setDoctorId(el.value.trim());
    el.addEventListener('input', handler);
    return () => el.removeEventListener('input', handler);
  }, []);
  if (!doctorId) return <p className="text-sm text-gray-400 mt-2">Enter a Doctor ID above to manage availability.</p>;
  return <DoctorAvailabilityPage doctorId={doctorId} />;
}

function ScheduleTabWrapper() {
  const [doctorId, setDoctorId] = useState('');
  useEffect(() => {
    const el = document.getElementById('schedule-doctor-id');
    if (!el) return;
    const handler = () => setDoctorId(el.value.trim());
    el.addEventListener('input', handler);
    return () => el.removeEventListener('input', handler);
  }, []);
  if (!doctorId) return <p className="text-sm text-gray-400 mt-2">Enter a Doctor ID above to view schedule.</p>;
  return <DoctorSchedulePage doctorId={doctorId} />;
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <LanguageProvider>
      <BookingProvider>
        <AppInner />
        <BookingWizard />
      </BookingProvider>
    </LanguageProvider>
  );
}

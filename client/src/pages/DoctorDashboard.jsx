// ─────────────────────────────────────────────────────────────────────────────
// DoctorDashboard – MediShield AI
//
// Admin table showing all patient messages collected by the AI chatbot.
// Columns: #, Patient, WhatsApp, Symptoms, Doctor, Date, Status, Reference
//
// Status toggle: clicking the badge switches a log between
//   pending  (yellow)  →  contacted  (green)
//   contacted (green)  →  pending   (yellow)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { getChatLogs, updateLogStatus } from '../api/chatApi';
import { getDoctorAppointments } from '../api/appointmentApi';
import { addFollowupNote } from '../api/reviewApi';

// ── Stat card (summary row at top) ────────────────────────────────────────────
function StatCard({ label, value, icon, color }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-extrabold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Status badge + toggle ─────────────────────────────────────────────────────
function StatusBadge({ status, onToggle, loading }) {
  const isPending = status === 'pending';
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
        border transition-all duration-150 cursor-pointer
        ${isPending
          ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
          : 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'}
        ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
      title="Click to toggle status"
    >
      <span className={`w-2 h-2 rounded-full ${isPending ? 'bg-amber-400' : 'bg-green-400'}`} />
      {loading ? '...' : isPending ? 'Pending' : 'Contacted'}
    </button>
  );
}

// ── Truncate long symptom text ────────────────────────────────────────────────
function Truncated({ text, max = 60 }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span className="text-gray-400">—</span>;
  if (text.length <= max) return <span>{text}</span>;
  return (
    <span>
      {expanded ? text : `${text.slice(0, max)}...`}
      <button
        onClick={() => setExpanded(!expanded)}
        className="ml-1 text-primary-500 hover:underline text-xs font-medium"
      >
        {expanded ? 'less' : 'more'}
      </button>
    </span>
  );
}

// ── Format date to Pakistan time ──────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-PK', {
    timeZone:  'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyTable({ filter }) {
  return (
    <tr>
      <td colSpan={8} className="py-16 text-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">
            {filter === 'all' ? 'No patient messages yet.' : `No ${filter} messages.`}
          </p>
          <p className="text-xs text-gray-400 mt-1">Messages will appear here after patients chat with your AI assistant.</p>
        </div>
      </td>
    </tr>
  );
}

// ── Return-in-days options ────────────────────────────────────────────────────
const RETURN_OPTIONS = [
  { value: 7,  label: '1 week'   },
  { value: 14, label: '2 weeks'  },
  { value: 30, label: '1 month'  },
  { value: 60, label: '2 months' },
  { value: 90, label: '3 months' },
];

// ── Doctor Notes sub-panel ────────────────────────────────────────────────────
function DoctorNotesPanel() {
  const [doctorId,   setDoctorId]   = useState('');
  const [appts,      setAppts]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [notes,      setNotes]      = useState({});       // { appointmentId: { note, returnInDays } }
  const [saving,     setSaving]     = useState(null);     // appointmentId being saved
  const [saved,      setSaved]      = useState({});       // { appointmentId: true }
  const [error,      setError]      = useState('');

  async function fetchAppts() {
    if (!doctorId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await getDoctorAppointments(doctorId.trim());
      const completed = (data.appointments || []).filter((a) => a.status === 'completed');
      setAppts(completed);
      const initial = {};
      completed.forEach((a) => {
        initial[a._id] = { note: a.doctorNote || '', returnInDays: a.returnInDays || '' };
      });
      setNotes(initial);
    } catch {
      setError('Could not load appointments.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(apptId) {
    const { note, returnInDays } = notes[apptId] || {};
    setSaving(apptId);
    try {
      await addFollowupNote(apptId, {
        note: note || '',
        returnInDays: returnInDays ? Number(returnInDays) : null,
      });
      setSaved((prev) => ({ ...prev, [apptId]: true }));
      setTimeout(() => setSaved((prev) => { const n = { ...prev }; delete n[apptId]; return n; }), 2500);
    } catch {
      // silent — note will be retried
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Doctor ID lookup */}
      <div className="flex gap-3 items-end">
        <div className="flex-1 max-w-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Doctor ID</label>
          <input
            type="text"
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            placeholder="Paste Doctor MongoDB _id"
            className="form-input font-mono text-xs"
          />
        </div>
        <button
          onClick={fetchAppts}
          disabled={loading || !doctorId.trim()}
          className="btn-primary px-4 py-2.5 text-sm"
        >
          {loading ? 'Loading…' : 'Load Appointments'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {appts.length === 0 && !loading && doctorId && (
        <p className="text-sm text-gray-400 text-center py-8">No completed appointments found.</p>
      )}

      {appts.map((a) => (
        <div key={a._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <p className="font-bold text-gray-900">{a.patientName}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {a.date} · {a.time} · <span className="font-mono">{a.referenceNumber}</span>
              </p>
            </div>
            <span className="text-xs bg-green-100 text-green-700 font-semibold px-2.5 py-1 rounded-full">
              Completed
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Doctor's Note</label>
              <textarea
                value={notes[a._id]?.note || ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [a._id]: { ...prev[a._id], note: e.target.value } }))}
                rows={2}
                maxLength={1000}
                placeholder="Add clinical note or follow-up instructions for the patient…"
                className="form-input resize-none text-sm w-full"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Return Visit Reminder</label>
                <select
                  value={notes[a._id]?.returnInDays || ''}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [a._id]: { ...prev[a._id], returnInDays: e.target.value } }))}
                  className="form-input text-sm"
                >
                  <option value="">— No reminder —</option>
                  {RETURN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => handleSave(a._id)}
                disabled={saving === a._id}
                className={`mt-5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                  ${saved[a._id]
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'btn-primary'}`}
              >
                {saving === a._id ? 'Saving…' : saved[a._id] ? '✓ Saved' : 'Save Note'}
              </button>
            </div>

            {a.returnReminderDate && (
              <p className="text-xs text-amber-600">
                Reminder scheduled: {a.returnReminderDate}
                {a.returnReminderSent ? ' · Sent' : ' · Pending'}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DoctorDashboard() {
  const [panel,         setPanel]         = useState('messages'); // messages | notes
  const [logs,          setLogs]          = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [filter,        setFilter]        = useState('all');     // all | pending | contacted
  const [toggleLoading, setToggleLoading] = useState(null);     // id of row being toggled
  const [lastRefresh,   setLastRefresh]   = useState(null);

  // ── Fetch logs ─────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getChatLogs();
      setLogs(data.logs ?? []);
      setLastRefresh(new Date());
    } catch (err) {
      setError('Could not load messages. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Toggle status for a single log ────────────────────────────────────────
  const handleToggleStatus = async (log) => {
    const newStatus = log.status === 'pending' ? 'contacted' : 'pending';
    setToggleLoading(log._id);
    try {
      const result = await updateLogStatus(log._id, newStatus);
      setLogs((prev) =>
        prev.map((l) => (l._id === result.log._id ? result.log : l))
      );
    } catch (err) {
      console.error('Status toggle failed:', err);
    } finally {
      setToggleLoading(null);
    }
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalCount     = logs.length;
  const pendingCount   = logs.filter((l) => l.status === 'pending').length;
  const contactedCount = logs.filter((l) => l.status === 'contacted').length;

  // ── Apply front-end filter ─────────────────────────────────────────────────
  const visible = filter === 'all' ? logs : logs.filter((l) => l.status === filter);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-primary-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Doctor Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Manage patient messages and add clinical notes</p>
          </div>
          {panel === 'messages' && (
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="btn-outline text-sm px-4 py-2.5 flex items-center gap-2"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          )}
        </div>

        {/* ── Panel switcher ────────────────────────────────────────────────── */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'messages', label: 'Patient Messages' },
            { id: 'notes',    label: 'Doctor Notes'     },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setPanel(p.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all
                ${panel === p.id ? 'bg-primary-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* ── Doctor Notes panel ────────────────────────────────────────────── */}
        {panel === 'notes' && <DoctorNotesPanel />}

        {/* ── Messages panel ───────────────────────────────────────────────── */}
        {panel === 'messages' && (<>

        {/* ── Stats row ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Total Messages"
            value={totalCount}
            color="bg-primary-100"
            icon={
              <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            }
          />
          <StatCard
            label="Pending Follow-up"
            value={pendingCount}
            color="bg-amber-100"
            icon={
              <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="Contacted"
            value={contactedCount}
            color="bg-green-100"
            icon={
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>

        {/* ── Filter tabs ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-4">
          {[
            { id: 'all',       label: `All (${totalCount})`         },
            { id: 'pending',   label: `Pending (${pendingCount})`   },
            { id: 'contacted', label: `Contacted (${contactedCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150
                ${filter === tab.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['#', 'Patient', 'WhatsApp', 'Symptoms', 'Doctor', 'Received', 'Status', 'Reference'].map((h) => (
                    <th key={h}
                      className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {/* Loading skeleton */}
                {loading && [1, 2, 3].map((n) => (
                  <tr key={n} className="animate-pulse">
                    {[...Array(8)].map((_, i) => (
                      <td key={i} className="px-4 py-4">
                        <div className="h-3 bg-gray-200 rounded-full w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Data rows */}
                {!loading && visible.length === 0 && <EmptyTable filter={filter} />}

                {!loading && visible.map((log, idx) => (
                  <tr
                    key={log._id}
                    className={`transition-colors hover:bg-gray-50
                      ${log.status === 'pending' ? 'border-l-2 border-l-amber-400' : 'border-l-2 border-l-green-400'}`}
                  >
                    {/* Row number */}
                    <td className="px-4 py-4 text-gray-400 font-medium">{idx + 1}</td>

                    {/* Patient name */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-primary-700">
                            {log.patientName?.charAt(0)?.toUpperCase()}
                          </span>
                        </div>
                        <span className="font-semibold text-gray-900">{log.patientName}</span>
                      </div>
                    </td>

                    {/* WhatsApp number */}
                    <td className="px-4 py-4">
                      <a
                        href={`https://wa.me/${log.patientPhone?.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-green-700 font-medium hover:underline"
                      >
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        {log.patientPhone}
                      </a>
                    </td>

                    {/* Symptoms */}
                    <td className="px-4 py-4 text-gray-700 max-w-[200px]">
                      <Truncated text={log.symptoms} />
                    </td>

                    {/* Doctor */}
                    <td className="px-4 py-4 text-gray-700 font-medium whitespace-nowrap">
                      Dr. {log.doctorName}
                    </td>

                    {/* Timestamp */}
                    <td className="px-4 py-4 text-gray-500 whitespace-nowrap text-xs">
                      {formatDate(log.createdAt)}
                    </td>

                    {/* Status toggle */}
                    <td className="px-4 py-4">
                      <StatusBadge
                        status={log.status}
                        onToggle={() => handleToggleStatus(log)}
                        loading={toggleLoading === log._id}
                      />
                    </td>

                    {/* Reference number */}
                    <td className="px-4 py-4">
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                        {log.referenceNumber}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          {!loading && visible.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-right">
              {visible.length} {visible.length === 1 ? 'record' : 'records'} shown
              · Click any Status badge to toggle it
            </div>
          )}
        </div>
        </>)}
      </div>
    </div>
  );
}

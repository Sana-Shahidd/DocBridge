import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getReports, exportReportsCSV, downloadIntelligenceBrief } from '../api/synthshield'
import {
  FileText, Download, Filter, ChevronDown, ChevronUp,
  AlertTriangle, RefreshCw, Inbox, ExternalLink,
} from 'lucide-react'
import ScoreBadge from '../components/ScoreBadge'
import FileTypeIcon from '../components/FileTypeIcon'
import LoadingSpinner from '../components/LoadingSpinner'

const STATUS_COLORS = {
  pending:    'text-amber-400 bg-amber-950/40 border-amber-900/50',
  reviewed:   'text-blue-400  bg-blue-950/40  border-blue-900/50',
  escalated:  'text-red-400   bg-red-950/40   border-red-900/50',
  closed:     'text-stone-500  bg-[#243028]/60  border-emerald-900/30',
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function fmtId(id) {
  return id ? id.slice(0, 12) + '…' : '—'
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({ filters, onChange }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-[#1a2119] border border-emerald-900/30 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3
                   text-sm text-stone-400 hover:text-emerald-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-emerald-400" />
          Filters
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-emerald-900/30"
          >
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-stone-500">DATE FROM</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
                  className="w-full bg-[#243028] border border-emerald-900/30 rounded-lg px-3 py-2
                             text-sm text-emerald-100 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-stone-500">DATE TO</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={e => onChange({ ...filters, dateTo: e.target.value })}
                  className="w-full bg-[#243028] border border-emerald-900/30 rounded-lg px-3 py-2
                             text-sm text-emerald-100 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-stone-500">
                  MAX SCORE: {filters.scoreMax}
                </label>
                <input
                  type="range" min={0} max={100} step={5}
                  value={filters.scoreMax}
                  onChange={e => onChange({ ...filters, scoreMax: Number(e.target.value) })}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Report row ────────────────────────────────────────────────────────────────
function ReportRow({ report, onBrief }) {
  const statusCls = STATUS_COLORS[report.status] ?? STATUS_COLORS.pending

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-emerald-900/20 hover:bg-[#243028]/30 transition-colors group"
    >
      <td className="px-4 py-3 font-mono text-xs text-stone-500">
        {fmtId(report.id)}
      </td>
      <td className="px-4 py-3 text-xs text-stone-400">
        {fmtDate(report.created_at)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-stone-400">
          <FileTypeIcon type={report.file_type} className="w-3.5 h-3.5 text-stone-500" />
          {report.file_type ?? '—'}
        </div>
      </td>
      <td className="px-4 py-3">
        {report.reality_score != null
          ? <ScoreBadge score={report.reality_score} size="sm" />
          : <span className="text-xs text-stone-600">—</span>
        }
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex px-2 py-0.5 rounded-md border text-[11px] font-mono ${statusCls}`}>
          {report.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <a
            href={`/results/${report.analysis_id}`}
            className="p-1.5 rounded-lg text-stone-600 hover:text-emerald-400
                       hover:bg-emerald-700/12 transition-colors"
            title="View analysis"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => onBrief(report)}
            className="p-1.5 rounded-lg text-stone-600 hover:text-emerald-400
                       hover:bg-emerald-700/12 transition-colors"
            title="Download intelligence brief"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </motion.tr>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="py-20 flex flex-col items-center gap-4 text-center"
    >
      <div className="w-14 h-14 rounded-2xl bg-[#1a2119] border border-emerald-900/30
                      flex items-center justify-center">
        <Inbox className="w-6 h-6 text-stone-600" />
      </div>
      <div>
        <p className="text-stone-300 font-semibold">No reports yet</p>
        <p className="text-stone-600 text-sm mt-1 max-w-xs">
          Reports are created automatically when you click "Report to Cybercrime"
          on an analysis result page.
        </p>
      </div>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [reports, setReports] = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', scoreMax: 100 })

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getReports({ ...filters, limit: 50 })
      setReports(data.reports ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setError('Failed to load reports.')
    } finally {
      setLoading(false)
    }
  }, [filters])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchReports() }, [fetchReports])

  function downloadBrief(report) {
    const score = report.reality_score ?? 50
    const clusterId =
      score >= 80 ? 'cluster_likely_real' :
      score >= 50 ? 'cluster_suspicious'  :
                    'cluster_likely_fake'
    downloadIntelligenceBrief(clusterId)
  }

  return (
    <div className="min-h-screen grid-bg">
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px]
                   bg-emerald-700/6 rounded-full blur-3xl"
      />

      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-16 space-y-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-start justify-between gap-4"
        >
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                            bg-red-600/10 border border-red-500/20 text-red-400
                            text-xs font-mono tracking-wider mb-3">
              <AlertTriangle className="w-3 h-3" />
              FIA CYBERCRIME WING — RESTRICTED
            </div>
            <h1 className="text-3xl font-black text-emerald-50 tracking-tight">
              Cybercrime Reports
            </h1>
            <p className="text-stone-500 text-sm mt-1">
              {total} report{total !== 1 ? 's' : ''} on record
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchReports}
              className="flex items-center gap-2 h-9 px-4 rounded-xl border border-emerald-900/30
                         text-stone-400 hover:text-emerald-50 text-sm transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={exportReportsCSV}
              className="flex items-center gap-2 h-9 px-4 rounded-xl bg-emerald-700
                         hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export All CSV
            </button>
          </div>
        </motion.div>

        {/* Filters */}
        <FilterBar filters={filters} onChange={setFilters} />

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#1a2119] border border-emerald-900/30 rounded-2xl overflow-hidden"
        >
          {loading ? (
            <div className="py-20 flex justify-center">
              <LoadingSpinner label="Loading reports..." />
            </div>
          ) : error ? (
            <div className="py-20 text-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          ) : reports.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-emerald-900/30 bg-[#1a2119]/80">
                    {['Report ID', 'Date', 'File Type', 'Score', 'Status', 'Actions'].map(h => (
                      <th key={h}
                        className="px-4 py-3 text-[11px] font-mono text-stone-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <ReportRow key={r.id} report={r} onBrief={downloadBrief} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* FIA note */}
        <p className="text-center text-xs text-stone-700 font-mono">
          Intelligence briefs are classified RESTRICTED. Distribute only to authorised personnel.
          FIA Cybercrime Wing ref: SynthShield-v3 / UNRESTRICTED exports require senior sign-off.
        </p>
      </main>
    </div>
  )
}

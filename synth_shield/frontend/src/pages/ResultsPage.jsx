import { useState, useEffect } from 'react'
import { useLocation, useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getAnalysisResult, createReport } from '../api/synthshield'
import {
  Download, AlertTriangle, Shield, RotateCcw, ChevronDown, ChevronUp,
  Newspaper, FileSearch, Mic, Brain, Zap, Globe, X,
  ExternalLink, AlertCircle, CheckCircle2, Clock, Hash, FileType,
  HardDrive, Lock,
} from 'lucide-react'
import RealityScoreGauge from '../components/RealityScoreGauge'

// ── Palette helpers ───────────────────────────────────────────────────────────
const SIGNAL_ICONS = {
  'CNN Deepfake Classifier': Brain,
  'Quantum Noise Analysis':  Zap,
  'Error Level Analysis':    FileSearch,
  'Metadata Integrity':      Shield,
  'News Context Match':      Newspaper,
  'Geographic Consistency':  Globe,
  'Voice Clone Detection':   Mic,
}

function barColor(fakeScore) {
  if (fakeScore < 0.3) return '#10b981'
  if (fakeScore < 0.65) return '#f59e0b'
  return '#ef4444'
}

function fmtHash(h) {
  return h ? h.slice(0, 12) : '—'
}

// ── Circular progress for news score ─────────────────────────────────────────
function CircularProgress({ value = 0, size = 80, stroke = 7, color = '#10b981' }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * Math.max(0, Math.min(1, value))
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="#27272a" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 1.2, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  )
}

// ── Cybercrime report modal ───────────────────────────────────────────────────
function CybercrimeModal({ data, onClose }) {
  const [sent, setSent] = useState(false)
  const report = [
    `REPORT SUBJECT: Suspected Synthetic / Manipulated Media`,
    ``,
    `Analysis ID : ${data.analysis_id ?? '—'}`,
    `File Name   : ${data.filename ?? '—'}`,
    `File Hash   : ${data.file_hash ?? '—'}`,
    `Reality Score: ${data.reality_score ?? '—'} / 100`,
    `Verdict     : ${data.verdict ?? '—'}`,
    ``,
    `This content was automatically flagged by the SynthShield deepfake detection`,
    `platform using quantum-assisted AI analysis. Please investigate accordingly.`,
    ``,
    `Generated: ${new Date().toUTCString()}`,
  ].join('\n')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#1a2119] border border-emerald-900/30 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-900/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-emerald-50">Report to Cybercrime</span>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-emerald-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {sent ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-8 space-y-3"
            >
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <p className="text-emerald-50 font-semibold">Report Copied</p>
              <p className="text-stone-500 text-sm">
                The pre-filled report has been copied to your clipboard.
                Submit it to your national cybercrime authority.
              </p>
            </motion.div>
          ) : (
            <>
              <p className="text-stone-400 text-sm">
                A pre-filled report has been generated based on the analysis results.
                Copy and submit to your national cybercrime authority.
              </p>
              <textarea
                readOnly
                value={report}
                rows={10}
                className="w-full bg-[#243028] border border-emerald-900/30 rounded-xl px-4 py-3
                           text-xs text-stone-300 font-mono resize-none focus:outline-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    navigator.clipboard.writeText(report)
                    try {
                      await createReport({
                        analysis_id: data.analysis_id,
                        description: report,
                        platform: 'SynthShield Auto-Report',
                      })
                    } catch { /* best effort */ }
                    setSent(true)
                  }}
                  className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white
                             text-sm font-semibold transition-colors"
                >
                  Copy Report
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 h-10 rounded-xl border border-emerald-900/30 text-stone-400
                             hover:text-emerald-50 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Signal bar row ────────────────────────────────────────────────────────────
function SignalRow({ item, delay }) {
  const Icon = SIGNAL_ICONS[item.signal] ?? Shield
  const pct  = Math.round((item.fake_score ?? 0) * 100)
  const color = barColor(item.fake_score ?? 0)

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay }}
      className="space-y-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-[#243028] border border-emerald-900/30
                          flex items-center justify-center flex-shrink-0">
            <Icon className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <span className="text-sm font-medium text-emerald-100 truncate">{item.signal}</span>
        </div>
        <span className="text-xs font-mono text-stone-500 flex-shrink-0 bg-[#243028]
                         border border-emerald-900/30 px-2 py-0.5 rounded-md">
          {item.weight}
        </span>
      </div>

      <div className="relative h-2 bg-[#243028] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay: delay + 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color }}
        />
      </div>

      <p className="text-xs text-stone-500 leading-relaxed">{item.finding}</p>
    </motion.div>
  )
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────
function Panel({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`bg-[#1a2119] border border-emerald-900/30 rounded-2xl overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-emerald-900/20">
        <Icon className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-emerald-100 font-mono tracking-wide">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ResultsPage() {
  const { state }  = useLocation()
  const { id }     = useParams()
  const navigate   = useNavigate()

  const [data,         setData]         = useState(state ?? null)
  const [loading,      setLoading]      = useState(!state)
  const [error,        setError]        = useState(null)
  const [exifOpen,     setExifOpen]     = useState(false)
  const [showModal,    setShowModal]    = useState(false)
  const [gaugeReady,   setGaugeReady]   = useState(false)

  // Fetch if page loaded directly (no router state)
  useEffect(() => {
    if (state) return
    getAnalysisResult(id)
      .then(d => setData(d))
      .catch(() => setError('Could not load analysis results.'))
      .finally(() => setLoading(false))
  }, [id, state])

  // Trigger staggered signals after gauge animation
  useEffect(() => {
    if (!data) return
    const t = setTimeout(() => setGaugeReady(true), 2800)
    return () => clearTimeout(t)
  }, [data])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
          <Shield className="w-8 h-8 text-emerald-400" />
        </motion.div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-stone-400">{error ?? 'No results found.'}</p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-medium"
        >
          Analyze a file
        </button>
      </div>
    )
  }

  const {
    filename, file_hash, file_type,
    reality_score, verdict, color, confidence,
    signal_breakdown = [],
    geolocation_result: geo,
    news_verification: news,
    metadata,
    certificate_url,
  } = data

  const metaSuspFlags = metadata?.suspicious_flags ?? []
  const exifData      = metadata?.exif_data ?? {}
  const elaBase64     = metadata?.ela_image_base64
  const newsScore     = news?.context_match_score ?? null
  const newsColor     = newsScore === null ? '#71717a'
    : newsScore >= 0.7 ? '#10b981'
    : newsScore >= 0.4 ? '#f59e0b'
    : '#ef4444'

  return (
    <>
      <div className="min-h-screen grid-bg pb-32">
        {/* Ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px]
                     bg-emerald-700/6 rounded-full blur-3xl"
        />

        <main className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-24 pb-8 space-y-6">

          {/* ── File info bar ───────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-wrap items-center gap-3 text-xs font-mono text-stone-500"
          >
            {[
              { icon: FileType,  label: file_type ?? '—' },
              { icon: Hash,      label: fmtHash(file_hash) },
              { icon: HardDrive, label: filename ?? '—' },
              { icon: Clock,     label: new Date().toLocaleString() },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5 bg-[#1a2119] border border-emerald-900/30
                                           px-2.5 py-1 rounded-lg">
                <Icon className="w-3 h-3" />
                {label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 bg-[#1a2119] border border-emerald-900/30 px-2.5 py-1 rounded-lg">
              <Lock className="w-3 h-3" />
              {`${Math.round((confidence ?? 0) * 100)}% confidence`}
            </span>
          </motion.div>

          {/* ── Gauge card ──────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-[#1a2119] border border-emerald-900/30 rounded-2xl p-6 sm:p-8
                       shadow-[0_0_60px_rgba(0,0,0,0.4)] text-center"
          >
            <p className="text-xs font-mono text-stone-500 tracking-widest mb-4 uppercase">
              Reality Score
            </p>
            <RealityScoreGauge
              score={reality_score ?? 50}
              verdict={verdict ?? 'Inconclusive'}
              color={color ?? 'gray'}
            />
          </motion.div>

          {/* ── Signal breakdown ────────────────────────────────────────────── */}
          <AnimatePresence>
            {gaugeReady && signal_breakdown.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Panel title="SIGNAL BREAKDOWN" icon={Zap}>
                  <div className="space-y-6 divide-y divide-zinc-800">
                    {signal_breakdown.map((item, i) => (
                      <div key={item.signal} className={i > 0 ? 'pt-6' : ''}>
                        <SignalRow item={item} delay={i * 0.12} />
                      </div>
                    ))}
                  </div>
                </Panel>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── GeoLens panel ───────────────────────────────────────────────── */}
          {geo && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <Panel title="GEOLENS ANALYSIS" icon={Globe}>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-[#243028]/50 border border-emerald-900/25 rounded-xl p-4">
                      <p className="text-xs font-mono text-stone-500 mb-1">DETECTED REGION</p>
                      <p className="text-emerald-50 font-semibold text-sm">
                        {geo.estimated_region ?? '—'}
                      </p>
                    </div>
                    <div className="bg-[#243028]/50 border border-emerald-900/25 rounded-xl p-4">
                      <p className="text-xs font-mono text-stone-500 mb-1">EST. TIME PERIOD</p>
                      <p className="text-emerald-50 font-semibold text-sm">
                        {geo.estimated_time_period ?? '—'}
                      </p>
                    </div>
                  </div>

                  {/* Claim check */}
                  {geo.claim_check && (
                    <div className={`rounded-xl border p-4 space-y-2 ${
                      geo.claim_check.mismatch
                        ? 'bg-red-950/30 border-red-900/50'
                        : 'bg-emerald-950/20 border-emerald-900/40'
                    }`}>
                      <div className="flex items-center gap-2">
                        {geo.claim_check.mismatch
                          ? <AlertTriangle className="w-4 h-4 text-red-400" />
                          : <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        }
                        <span className={`text-sm font-semibold ${
                          geo.claim_check.mismatch ? 'text-red-300' : 'text-emerald-300'
                        }`}>
                          {geo.claim_check.mismatch ? 'Location Mismatch Detected' : 'Location Consistent'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div>
                          <span className="text-stone-500">CLAIMED</span>
                          <p className="text-stone-300 mt-0.5">{geo.claim_check.claimed ?? '—'}</p>
                        </div>
                        <div>
                          <span className="text-stone-500">DETECTED</span>
                          <p className="text-stone-300 mt-0.5">{geo.claim_check.detected ?? '—'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Visual cues */}
                  {Array.isArray(geo.visual_cues) && geo.visual_cues.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-stone-500 mb-2">VISUAL CUES</p>
                      <div className="flex flex-wrap gap-2">
                        {geo.visual_cues.map((cue, i) => (
                          <span key={i}
                            className="px-2.5 py-1 rounded-lg bg-[#243028] border border-emerald-900/30
                                       text-xs text-stone-300">
                            {cue}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
            </motion.div>
          )}

          {/* ── News verification panel ──────────────────────────────────────── */}
          {news && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
            >
              <Panel title="NEWS VERIFICATION" icon={Newspaper}>
                <div className="space-y-5">
                  {/* Circular score */}
                  {newsScore !== null && (
                    <div className="flex items-center gap-5">
                      <div className="relative flex-shrink-0">
                        <CircularProgress value={newsScore} size={84} color={newsColor} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-sm font-black text-emerald-50">
                            {Math.round(newsScore * 100)}%
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-emerald-100">Context Match Score</p>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {newsScore >= 0.7
                            ? 'Content context strongly supported by news sources'
                            : newsScore >= 0.4
                            ? 'Partial match — some discrepancies found'
                            : 'Context contradicts or not found in news sources'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Mismatch alerts */}
                  {Array.isArray(news.mismatch_alerts) && news.mismatch_alerts.length > 0 && (
                    <div className="space-y-2">
                      {news.mismatch_alerts.map((alert, i) => (
                        <div key={i}
                          className="flex items-start gap-2 px-3 py-2 rounded-lg
                                     bg-red-950/30 border border-red-900/40">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-300">{alert}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sources */}
                  {Array.isArray(news.matching_sources) && news.matching_sources.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-stone-500 mb-2">MATCHING SOURCES</p>
                      <div className="flex flex-wrap gap-2">
                        {news.matching_sources.map((src, i) => (
                          <a key={i} href={src} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg
                                       bg-emerald-950/40 border border-emerald-900/50
                                       text-xs text-emerald-300 hover:border-emerald-700 transition-colors">
                            <ExternalLink className="w-2.5 h-2.5" />
                            Source {i + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(news.contradicting_sources) && news.contradicting_sources.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-stone-500 mb-2">CONTRADICTING SOURCES</p>
                      <div className="flex flex-wrap gap-2">
                        {news.contradicting_sources.map((src, i) => (
                          <a key={i} href={src} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg
                                       bg-red-950/40 border border-red-900/50
                                       text-xs text-red-300 hover:border-red-700 transition-colors">
                            <ExternalLink className="w-2.5 h-2.5" />
                            Source {i + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
            </motion.div>
          )}

          {/* ── Metadata panel ───────────────────────────────────────────────── */}
          {metadata && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <Panel title="METADATA &amp; ELA" icon={FileSearch}>
                <div className="space-y-5">
                  {/* Suspicious flags */}
                  {metaSuspFlags.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-stone-500 mb-2">SUSPICIOUS FLAGS</p>
                      <div className="flex flex-wrap gap-2">
                        {metaSuspFlags.map((flag, i) => (
                          <span key={i}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                                       bg-red-950/40 border border-red-900/50 text-xs text-red-300">
                            <AlertTriangle className="w-3 h-3" />
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ELA image */}
                  {elaBase64 && (
                    <div>
                      <p className="text-xs font-mono text-stone-500 mb-2">ERROR LEVEL ANALYSIS (ELA)</p>
                      <div className="rounded-xl overflow-hidden border border-emerald-900/30">
                        <img
                          src={`data:image/png;base64,${elaBase64}`}
                          alt="ELA visualization"
                          className="w-full object-cover max-h-64"
                        />
                      </div>
                      <p className="text-[11px] text-stone-600 mt-1 font-mono">
                        Brighter regions indicate areas of potential manipulation.
                      </p>
                    </div>
                  )}

                  {/* Collapsible EXIF */}
                  {Object.keys(exifData).length > 0 && (
                    <div>
                      <button
                        onClick={() => setExifOpen(o => !o)}
                        className="flex items-center gap-2 text-xs font-mono text-stone-500
                                   hover:text-stone-300 transition-colors w-full text-left"
                      >
                        {exifOpen
                          ? <ChevronUp className="w-3.5 h-3.5" />
                          : <ChevronDown className="w-3.5 h-3.5" />
                        }
                        EXIF DATA ({Object.keys(exifData).length} fields)
                      </button>
                      <AnimatePresence>
                        {exifOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 rounded-xl bg-[#243028]/50 border border-emerald-900/25
                                            divide-y divide-zinc-700/40 text-xs font-mono overflow-hidden">
                              {Object.entries(exifData).slice(0, 30).map(([k, v]) => (
                                <div key={k}
                                  className="flex items-start gap-3 px-4 py-2.5">
                                  <span className="text-stone-500 flex-shrink-0 w-44 truncate">{k}</span>
                                  <span className="text-stone-300 break-all">{String(v)}</span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </Panel>
            </motion.div>
          )}

        </main>
      </div>

      {/* ── Sticky action bar ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="fixed bottom-0 inset-x-0 z-40 border-t border-emerald-900/30/80
                   bg-[#0f1410]/90 backdrop-blur-md"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          {certificate_url && (
            <a
              href={certificate_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 h-9 rounded-xl bg-emerald-700 hover:bg-emerald-600
                         text-white text-sm font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Certificate
            </a>
          )}

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 h-9 rounded-xl bg-red-900/50 hover:bg-red-900/80
                       border border-red-800/60 text-red-300 text-sm font-medium transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            Report to Cybercrime
          </button>

          <button
            onClick={() => navigate('/source-protect')}
            className="flex items-center gap-2 px-4 h-9 rounded-xl bg-[#243028] hover:bg-emerald-900/40
                       border border-emerald-900/30 text-stone-300 text-sm font-medium transition-colors"
          >
            <Shield className="w-4 h-4" />
            Protect Source
          </button>

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 h-9 rounded-xl border border-emerald-900/30
                       text-stone-400 hover:text-emerald-50 text-sm font-medium transition-colors ml-auto"
          >
            <RotateCcw className="w-4 h-4" />
            Analyze Another
          </button>
        </div>
      </motion.div>

      {/* ── Cybercrime modal ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showModal && (
          <CybercrimeModal data={data} onClose={() => setShowModal(false)} />
        )}
      </AnimatePresence>
    </>
  )
}

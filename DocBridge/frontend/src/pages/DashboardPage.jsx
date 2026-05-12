import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { getDashboardStats } from '../api/synthshield'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Activity, AlertTriangle, BarChart2, FileCheck,
  Globe, Shield, RefreshCw,
} from 'lucide-react'
import ScoreBadge from '../components/ScoreBadge'
import FileTypeIcon from '../components/FileTypeIcon'
import LoadingSpinner from '../components/LoadingSpinner'

// ── Palette ───────────────────────────────────────────────────────────────────
const PIE_COLORS = { image: '#2d6a4f', video: '#f59e0b', audio: '#10b981' }
const LINE_COLOR  = '#2d6a4f'

function clusterColor(label) {
  if (label === 'Likely Fake') return '#ef4444'
  if (label === 'Suspicious')  return '#f59e0b'
  return '#10b981'
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a2119] border border-emerald-900/30 rounded-xl px-3 py-2 text-xs">
      <p className="text-stone-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-emerald-700/12 border-emerald-600/25 text-emerald-400',
    green:  'bg-emerald-600/10 border-emerald-500/20 text-emerald-400',
    amber:  'bg-amber-600/10 border-amber-500/20 text-amber-400',
    red:    'bg-red-600/10 border-red-500/20 text-red-400',
  }
  return (
    <div className="bg-[#1a2119] border border-emerald-900/30 rounded-2xl p-5 space-y-3">
      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-2xl font-black text-emerald-50">{value ?? '—'}</p>
        <p className="text-xs text-stone-500 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-stone-600 font-mono mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function Panel({ title, icon: Icon, children }) {
  return (
    <div className="bg-[#1a2119] border border-emerald-900/30 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-emerald-900/20">
        <Icon className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-emerald-100 font-mono tracking-wide">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Derive dashboard metrics from /intelligence/patterns ──────────────────────
function deriveMetrics(patterns, recentAnalyses) {
  const total     = patterns?.total_analyses ?? 0
  const flagged   = patterns?.flagged_count  ?? 0
  const fakePct   = total ? Math.round((flagged / total) * 100) : 0

  const scores    = recentAnalyses.map(a => a.score).filter(Boolean)
  const avgScore  = scores.length
    ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
    : null

  // Group recent analyses by day for line chart
  const byDay = {}
  recentAnalyses.forEach(a => {
    const day = (a.created_at ?? '').slice(0, 10)
    if (!day) return
    byDay[day] = (byDay[day] ?? 0) + 1
  })
  const lineData = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, count]) => ({ date: date.slice(5), count }))

  // Threat type breakdown from all clusters
  const typeCounts = { image: 0, video: 0, audio: 0 }
  recentAnalyses.forEach(a => {
    const t = a.file_type
    if (t in typeCounts) typeCounts[t]++
  })
  const pieData = Object.entries(typeCounts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }))

  // Geographic origins from geolocation_result
  const geoCounts = {}
  recentAnalyses.forEach(a => {
    const region = a.geolocation_result?.estimated_region
    if (region) geoCounts[region] = (geoCounts[region] ?? 0) + 1
  })
  const geoData = Object.entries(geoCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)

  return { total, flagged, fakePct, avgScore, lineData, pieData, geoData }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [patterns, setPatterns]   = useState(null)
  const [recent,   setRecent]     = useState([])
  const [loading,  setLoading]    = useState(true)
  const [error,    setError]      = useState(null)

  async function fetchAll() {
    setLoading(true)
    setError(null)
    try {
      const stats = await getDashboardStats()
      // Reconstruct patterns shape for deriveMetrics
      setPatterns({
        total_analyses: stats.totalAnalyses,
        flagged_count:  stats.flaggedCount,
        clusters:       stats.clusters,
      })
      setRecent(
        stats.allAnalyses.sort((a, b) =>
          (b.created_at ?? '').localeCompare(a.created_at ?? '')
        )
      )
    } catch {
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll() }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner label="Loading intelligence data..." />
      </div>
    )
  }

  const { total, flagged, fakePct, avgScore, lineData, pieData, geoData } =
    deriveMetrics(patterns, recent)

  const clusters  = patterns?.clusters ?? []
  const last10    = recent.slice(0, 10)

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
                            bg-emerald-700/12 border border-emerald-600/25 text-emerald-400
                            text-xs font-mono tracking-wider mb-3">
              <BarChart2 className="w-3 h-3" />
              INTELLIGENCE DASHBOARD
            </div>
            <h1 className="text-3xl font-black text-emerald-50 tracking-tight">
              Threat Overview
            </h1>
          </div>
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 h-9 px-4 rounded-xl border border-emerald-900/30
                       text-stone-400 hover:text-emerald-50 text-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </motion.div>

        {error && (
          <div className="bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3
                          text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          <StatCard icon={Activity}     label="Total Analyses"    value={total}              color="indigo" />
          <StatCard icon={FileCheck}    label="Avg Reality Score" value={avgScore ?? '—'}    color="green"  sub="higher = more real" />
          <StatCard icon={AlertTriangle} label="Fake Content"     value={`${fakePct}%`}      color="red"    sub="score < 50" />
          <StatCard icon={Shield}       label="Flagged Files"     value={flagged}             color="amber"  />
        </motion.div>

        {/* Line chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Panel title="ANALYSES OVER TIME" icon={Activity}>
            {lineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={lineData}>
                  <XAxis dataKey="date" stroke="#52525b" tick={{ fontSize: 11, fill: '#71717a' }} />
                  <YAxis stroke="#52525b" tick={{ fontSize: 11, fill: '#71717a' }} allowDecimals={false} />
                  <Tooltip content={<ChartTip />} />
                  <Line
                    type="monotone" dataKey="count" name="Analyses"
                    stroke={LINE_COLOR} strokeWidth={2} dot={false}
                    activeDot={{ r: 4, fill: LINE_COLOR }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-stone-600 text-sm text-center py-8">No time data available.</p>
            )}
          </Panel>
        </motion.div>

        {/* Middle row: Campaign clusters + Geo distribution */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          {/* Campaign clusters */}
          <Panel title="CAMPAIGN DETECTION" icon={Shield}>
            <div className="space-y-3">
              {clusters.map(c => (
                <div key={c.cluster_id}
                  className="flex items-center justify-between gap-4 p-4
                             bg-[#243028]/50 border border-emerald-900/25 rounded-xl"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: clusterColor(c.label) }}
                      />
                      <span className="text-sm font-semibold text-emerald-100">{c.label}</span>
                      <span className="text-[11px] font-mono text-stone-600">
                        score {c.score_range}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500">
                      {c.count} file{c.count !== 1 ? 's' : ''}
                      {c.avg_score != null && ` · avg ${c.avg_score}`}
                    </p>
                  </div>
                  <a
                    href={`/api/intelligence/brief/${c.cluster_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs
                               bg-[#243028] border border-emerald-900/30 text-stone-400
                               hover:text-emerald-400 hover:border-emerald-600/40 transition-colors"
                  >
                    <Shield className="w-3 h-3" />
                    FIA Brief
                  </a>
                </div>
              ))}
              {clusters.length === 0 && (
                <p className="text-stone-600 text-sm text-center py-6">No cluster data yet.</p>
              )}
            </div>
          </Panel>

          {/* Geographic distribution */}
          <Panel title="GEOGRAPHIC ORIGINS" icon={Globe}>
            {geoData.length > 0 ? (
              <div className="space-y-3">
                {geoData.map(([region, count], i) => {
                  const pct = Math.round((count / recent.length) * 100)
                  return (
                    <div key={region} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-stone-300">{region}</span>
                        <span className="text-stone-500 font-mono">{count}</span>
                      </div>
                      <div className="h-1.5 bg-[#243028] rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, delay: i * 0.07 }}
                          className="h-full rounded-full bg-emerald-500"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-stone-600 text-sm text-center py-6">
                No geolocation data yet. Submit files with a claimed location.
              </p>
            )}
          </Panel>
        </motion.div>

        {/* Bottom row: Donut + Recent activity */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          {/* Threat type donut */}
          <Panel title="THREAT TYPE BREAKDOWN" icon={BarChart2}>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map(entry => (
                      <Cell
                        key={entry.name}
                        fill={PIE_COLORS[entry.name] ?? '#2d6a4f'}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                  <Legend
                    formatter={v => (
                      <span className="text-xs text-stone-400 capitalize">{v}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-stone-600 text-sm text-center py-8">No type data yet.</p>
            )}
          </Panel>

          {/* Recent activity */}
          <Panel title="RECENT ACTIVITY" icon={Activity}>
            <div className="space-y-2 divide-y divide-zinc-800/60">
              {last10.length > 0 ? last10.map((a, i) => (
                <div
                  key={a.analysis_id ?? i}
                  className="flex items-center justify-between gap-3 pt-2 first:pt-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileTypeIcon type={a.file_type} className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-stone-300 font-mono truncate">
                        {(a.analysis_id ?? '—').slice(0, 12)}…
                      </p>
                      <p className="text-[11px] text-stone-600">
                        {(a.created_at ?? '').slice(0, 10)}
                      </p>
                    </div>
                  </div>
                  <ScoreBadge score={a.score} size="sm" />
                </div>
              )) : (
                <p className="text-stone-600 text-sm text-center py-6">No recent activity.</p>
              )}
            </div>
          </Panel>
        </motion.div>

      </main>
    </div>
  )
}

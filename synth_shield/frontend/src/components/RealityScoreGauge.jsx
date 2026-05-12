import { useState, useEffect, useRef } from 'react'
import { animate, motion } from 'framer-motion'

// ── Geometry helpers ──────────────────────────────────────────────────────────
const CX = 150, CY = 148, R = 118, TRACK_W = 20

function scoreToAngle(score) {
  // score 0 → 180°, score 100 → 0°
  return 180 * (1 - Math.max(0, Math.min(100, score)) / 100)
}

function pt(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return [CX + R * Math.cos(rad), CY - R * Math.sin(rad)]
}

function arcD(fromScore, toScore) {
  const a1 = scoreToAngle(fromScore)
  const a2 = scoreToAngle(toScore)
  const [x1, y1] = pt(a1)
  const [x2, y2] = pt(a2)
  const span = a1 - a2
  const large = span > 180 ? 1 : 0
  return `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`
}

// ── Verdict palette ───────────────────────────────────────────────────────────
const PALETTE = {
  green: { hex: '#10b981', ring: 'rgba(16,185,129,0.25)', cls: 'text-emerald-400' },
  amber: { hex: '#f59e0b', ring: 'rgba(245,158,11,0.25)',  cls: 'text-amber-400'  },
  red:   { hex: '#ef4444', ring: 'rgba(239,68,68,0.25)',   cls: 'text-red-400'    },
  gray:  { hex: '#71717a', ring: 'rgba(113,113,122,0.25)', cls: 'text-stone-400'  },
}

const ZONE_COLORS = {
  red:   '#ef4444',
  amber: '#f59e0b',
  green: '#10b981',
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RealityScoreGauge({ score: targetScore = 50, verdict = 'Suspicious', color = 'amber' }) {
  const [score, setScore] = useState(100)
  const [glowVisible, setGlowVisible] = useState(false)
  const controlRef = useRef(null)
  const palette = PALETTE[color] ?? PALETTE.gray

  useEffect(() => {
    // Animate score counter from 100 down to actual score over 2.5s
    controlRef.current?.stop()

    // Defer the resets to avoid synchronous setState inside effect body
    const reset = setTimeout(() => {
      setScore(100)
      setGlowVisible(false)
    }, 0)

    const ctl = animate(100, targetScore, {
      duration: 2.5,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) { setScore(Math.round(v)) },
      onComplete() { setGlowVisible(true) },
    })
    controlRef.current = ctl
    return () => { clearTimeout(reset); ctl.stop() }
  }, [targetScore])

  // Needle geometry
  const angleDeg = scoreToAngle(score)
  const rad       = (angleDeg * Math.PI) / 180
  const tipX      = CX + (R - TRACK_W / 2 - 2) * Math.cos(rad)
  const tipY      = CY - (R - TRACK_W / 2 - 2) * Math.sin(rad)

  // Which zone is the score in right now?
  const zoneColor =
    score >= 80 ? ZONE_COLORS.green :
    score >= 50 ? ZONE_COLORS.amber :
    ZONE_COLORS.red

  const verdictDisplay = verdict.toUpperCase()

  return (
    <div className="flex flex-col items-center select-none">
      <div className="relative">
        {/* Pulsing glow behind gauge (appears after animation completes) */}
        {glowVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 rounded-full blur-2xl pointer-events-none"
            style={{
              background: palette.ring,
              top: '20%', left: '5%', right: '5%', bottom: '30%',
            }}
          />
        )}

        <svg viewBox="0 0 300 170" className="w-full max-w-[340px]" aria-label={`Reality score: ${targetScore}`}>
          <defs>
            <filter id="gauge-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* ── Background track (full semicircle) ────────────────────── */}
          <path
            d={arcD(0, 100)}
            fill="none"
            stroke="#243028"
            strokeWidth={TRACK_W}
            strokeLinecap="round"
          />

          {/* ── Color zones ───────────────────────────────────────────── */}
          <path d={arcD(0,  50)} fill="none" stroke={ZONE_COLORS.red}   strokeWidth={TRACK_W} opacity="0.35" />
          <path d={arcD(50, 80)} fill="none" stroke={ZONE_COLORS.amber} strokeWidth={TRACK_W} opacity="0.35" />
          <path d={arcD(80,100)} fill="none" stroke={ZONE_COLORS.green} strokeWidth={TRACK_W} opacity="0.35" />

          {/* ── Zone boundary ticks ───────────────────────────────────── */}
          {[50, 80].map(s => {
            const a = scoreToAngle(s)
            const r = (a * Math.PI) / 180
            const ox = CX + (R - TRACK_W) * Math.cos(r)
            const oy = CY - (R - TRACK_W) * Math.sin(r)
            const ix = CX + (R + 2) * Math.cos(r)
            const iy = CY - (R + 2) * Math.sin(r)
            return <line key={s} x1={ox} y1={oy} x2={ix} y2={iy} stroke="#3d5442" strokeWidth="1.5" />
          })}

          {/* ── Active arc (filled from 0 to current score) ───────────── */}
          {score > 0 && (
            <path
              d={arcD(0, score)}
              fill="none"
              stroke={zoneColor}
              strokeWidth={TRACK_W - 4}
              strokeLinecap="round"
              filter="url(#gauge-glow)"
            />
          )}

          {/* ── Score labels at arc ends ──────────────────────────────── */}
          <text x={CX - R - 10} y={CY + 18} fill="#4d6652" fontSize="11" fontFamily="monospace" textAnchor="middle">0</text>
          <text x={CX + R + 10} y={CY + 18} fill="#4d6652" fontSize="11" fontFamily="monospace" textAnchor="middle">100</text>
          <text x={CX}          y={30}       fill="#4d6652" fontSize="11" fontFamily="monospace" textAnchor="middle">50</text>

          {/* ── Needle ────────────────────────────────────────────────── */}
          <line
            x1={CX} y1={CY}
            x2={tipX} y2={tipY}
            stroke="white"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.85}
          />
          {/* Needle cap at center */}
          <circle cx={CX} cy={CY} r={7} fill="#1a2119" stroke="#3d5442" strokeWidth={1.5} />
          <circle cx={CX} cy={CY} r={3.5} fill="white" opacity={0.9} />
          {/* Glowing tip */}
          <circle cx={tipX} cy={tipY} r={4} fill={zoneColor} filter="url(#gauge-glow)" />

          {/* ── Center score number ───────────────────────────────────── */}
          <text
            x={CX} y={CY + 10}
            textAnchor="middle"
            fontSize="54"
            fontWeight="900"
            fontFamily="system-ui, sans-serif"
            fill="white"
            letterSpacing="-2"
          >
            {score}
          </text>
          <text
            x={CX + 46} y={CY + 6}
            textAnchor="start"
            fontSize="16"
            fill="#4d6652"
            fontFamily="monospace"
          >
            /100
          </text>
        </svg>
      </div>

      {/* ── Verdict label ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: glowVisible ? 1 : 0, y: glowVisible ? 0 : 8 }}
        transition={{ duration: 0.4 }}
        className="mt-1 text-center"
      >
        <span
          className={`text-lg font-black tracking-[0.2em] font-mono ${palette.cls}`}
        >
          {verdictDisplay}
        </span>
      </motion.div>
    </div>
  )
}

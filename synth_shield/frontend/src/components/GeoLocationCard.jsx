import { MapPin, AlertTriangle, CheckCircle2 } from 'lucide-react'

export default function GeoLocationCard({ geo }) {
  if (!geo) return null
  const cc = geo.claim_check
  const mismatch = cc?.mismatch

  return (
    <div className="bg-[#1a2119]/60 border border-emerald-900/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-xs font-mono text-stone-400 uppercase tracking-wider">GeoLens</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
        <div>
          <p className="text-stone-500 mb-0.5">DETECTED</p>
          <p className="text-emerald-100">{geo.estimated_region ?? '—'}</p>
        </div>
        {cc?.claimed && (
          <div>
            <p className="text-stone-500 mb-0.5">CLAIMED</p>
            <p className="text-emerald-100">{cc.claimed}</p>
          </div>
        )}
      </div>

      {cc && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
          mismatch
            ? 'bg-red-950/40 border border-red-900/50 text-red-300'
            : 'bg-emerald-950/30 border border-emerald-900/40 text-emerald-300'
        }`}>
          {mismatch
            ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            : <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          }
          {mismatch ? 'Location mismatch detected' : 'Location consistent'}
        </div>
      )}

      {Array.isArray(geo.visual_cues) && geo.visual_cues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {geo.visual_cues.slice(0, 4).map((cue, i) => (
            <span key={i}
              className="px-2 py-0.5 rounded-md bg-[#243028] border border-emerald-900/30
                         text-[11px] text-stone-400">
              {cue}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

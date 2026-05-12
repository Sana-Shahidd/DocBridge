export default function ScoreBadge({ score, size = 'md' }) {
  const n = Math.round(score ?? 0)
  const color =
    n >= 80 ? 'text-emerald-400 bg-emerald-950/50 border-emerald-900/60' :
    n >= 50 ? 'text-amber-400  bg-amber-950/50  border-amber-900/60'  :
              'text-red-400    bg-red-950/50    border-red-900/60'

  const sz = size === 'sm'
    ? 'text-[11px] px-2 py-0.5'
    : 'text-xs px-2.5 py-1'

  return (
    <span className={`inline-flex items-center font-mono font-bold rounded-lg border ${color} ${sz}`}>
      {n}
    </span>
  )
}

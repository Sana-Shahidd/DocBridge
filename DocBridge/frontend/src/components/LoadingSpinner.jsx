import { motion } from 'framer-motion'
import { Shield } from 'lucide-react'

export default function LoadingSpinner({ label, size = 'md' }) {
  const sz = size === 'sm' ? 'w-5 h-5' : 'w-8 h-8'
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      >
        <Shield className={`${sz} text-emerald-400`} />
      </motion.div>
      {label && <p className="text-sm text-stone-500 font-mono">{label}</p>}
    </div>
  )
}

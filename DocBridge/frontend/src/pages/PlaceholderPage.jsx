import { motion } from 'framer-motion'
import { Construction } from 'lucide-react'

export default function PlaceholderPage({ title }) {
  return (
    <div className="min-h-screen grid-bg flex items-center justify-center pt-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <Construction className="w-10 h-10 text-zinc-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-zinc-300 mb-2">{title}</h2>
        <p className="text-zinc-600 text-sm font-mono">Coming soon</p>
      </motion.div>
    </div>
  )
}

import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }) {
  return (
    <AnimatePresence>
      {open && (
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
            animate={{ scale: 1,    opacity: 1 }}
            exit={{ scale: 0.92,    opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            onClick={e => e.stopPropagation()}
            className={`bg-[#1a2119] border border-emerald-900/40 rounded-2xl w-full ${maxWidth}
                        overflow-hidden shadow-2xl`}
          >
            {title && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-900/30">
                <span className="text-sm font-semibold text-emerald-50">{title}</span>
                <button onClick={onClose} className="text-stone-500 hover:text-emerald-200 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="p-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

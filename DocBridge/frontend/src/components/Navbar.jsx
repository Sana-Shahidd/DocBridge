import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'

const NAV_LINKS = [
  { to: '/',               label: 'Upload'         },
  { to: '/reports',        label: 'Reports'        },
  { to: '/dashboard',      label: 'Dashboard'      },
  { to: '/source-protect', label: 'Source Protect' },
]

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-emerald-900/30 bg-[#0f1410]/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <motion.div
            whileHover={{ rotate: 10, scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 300 }}
            className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center shadow-[0_0_16px_rgba(45,106,79,0.5)]"
          >
            <ShieldCheck className="w-4.5 h-4.5 text-emerald-100" strokeWidth={2.5} />
          </motion.div>
          <div className="leading-none">
            <span className="text-emerald-50 font-bold text-[15px] tracking-tight">
              SynthShield
            </span>
            <p className="text-[10px] text-emerald-700 font-mono tracking-widest mt-0.5">
              TRUTH IN EVERY PIXEL
            </p>
          </div>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ to, label }) => {
            const active = pathname === to || (to !== '/' && pathname.startsWith(to))
            return (
              <Link
                key={to}
                to={to}
                className={[
                  'relative px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200',
                  active
                    ? 'text-emerald-400'
                    : 'text-stone-400 hover:text-emerald-100 hover:bg-emerald-900/30',
                ].join(' ')}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-lg bg-emerald-700/15 border border-emerald-600/25"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative">{label}</span>
              </Link>
            )
          })}
        </div>

        {/* Status dot */}
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500 pulse-ring inline-block" />
          <span className="font-mono hidden sm:inline">SYSTEM ONLINE</span>
        </div>
      </div>
    </nav>
  )
}

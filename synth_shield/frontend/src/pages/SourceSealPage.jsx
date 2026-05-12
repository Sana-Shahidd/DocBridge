import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { protectSource, approveEscrow } from '../api/synthshield'
import {
  Mic, Shield, Lock, X, CheckCircle2, Download,
  Play, Pause, AlertCircle, FileAudio, FileVideo, Eye,
} from 'lucide-react'

const ACCEPTED = {
  'audio/mpeg':      ['.mp3'],
  'audio/wav':       ['.wav'],
  'audio/ogg':       ['.ogg'],
  'audio/mp4':       ['.m4a'],
  'audio/flac':      ['.flac'],
  'video/mp4':       ['.mp4'],
  'video/quicktime': ['.mov'],
}

const STAGES = [
  'Analyzing voice characteristics…',
  'Generating synthetic avatar…',
  'Storing in escrow…',
]

function formatBytes(b) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

// ── Synthetic audio player ────────────────────────────────────────────────────
function AudioPlayer({ src, label }) {
  const [playing, setPlaying] = useState(false)
  const ref = useRef(null)

  function toggle() {
    if (!ref.current) return
    if (playing) { ref.current.pause(); setPlaying(false) }
    else          { ref.current.play();  setPlaying(true) }
  }

  return (
    <div className="flex items-center gap-4 bg-[#243028]/50 border border-emerald-900/25
                    rounded-xl px-5 py-4">
      <button
        onClick={toggle}
        className="w-10 h-10 rounded-xl bg-emerald-700 hover:bg-emerald-600
                   flex items-center justify-center text-white transition-colors flex-shrink-0"
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div>
        <p className="text-sm font-semibold text-emerald-100">{label}</p>
        <p className="text-xs text-stone-500">Click to preview</p>
      </div>
      <audio ref={ref} src={src} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SourceSealPage() {
  const [file,         setFile]         = useState(null)
  const [sourceName,   setSourceName]   = useState('')
  const [journoName,   setJournoName]   = useState('')
  const [style,        setStyle]        = useState('neutral')
  const [error,        setError]        = useState(null)
  const [stageIdx,     setStageIdx]     = useState(0)
  const [loading,      setLoading]      = useState(false)
  const [result,       setResult]       = useState(null)
  const [approved,     setApproved]     = useState(false)
  const [approving,    setApproving]    = useState(false)
  const stageTimer = useRef(null)

  const onDrop = useCallback((accepted, rejected) => {
    setError(null)
    if (rejected?.length) {
      setError('Unsupported file. Accepted: MP3, WAV, OGG, M4A, FLAC, MP4, MOV.')
      return
    }
    if (accepted?.length) setFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPTED, maxFiles: 1, maxSize: 200 * 1024 * 1024,
  })

  function removeFile(e) {
    e.stopPropagation()
    setFile(null)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file)              { setError('Please upload a recording.'); return }
    if (!sourceName.trim()) { setError('Source name is required.'); return }
    if (!journoName.trim()) { setError('Journalist name is required.'); return }

    setError(null)
    setLoading(true)
    setStageIdx(0)
    setResult(null)
    setApproved(false)

    // Cycle stages
    stageTimer.current = setInterval(() => {
      setStageIdx(i => Math.min(i + 1, STAGES.length - 1))
    }, 2200)

    try {
      const data = await protectSource(file, sourceName.trim(), journoName.trim(), style)
      setResult(data)
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(
        typeof detail === 'string' ? detail :
        detail?.detail ?? 'Source Seal processing failed. Please try again.'
      )
    } finally {
      clearInterval(stageTimer.current)
      setLoading(false)
    }
  }

  async function handleApprove() {
    if (!result?.escrow?.escrow_id) return
    setApproving(true)
    try {
      await approveEscrow(result.escrow.escrow_id)
      setApproved(true)
    } catch {
      setError('Approval failed. Please try again.')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="min-h-screen grid-bg">
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px]
                   bg-emerald-700/6 rounded-full blur-3xl"
      />

      <main className="relative max-w-2xl mx-auto px-4 sm:px-6 pt-24 pb-16 space-y-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                          bg-emerald-700/12 border border-emerald-600/25 text-emerald-400
                          text-xs font-mono tracking-wider mb-4">
            <Lock className="w-3 h-3" />
            JOURNALIST SOURCE PROTECTION
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-emerald-50 tracking-tight mb-3">
            Source Seal
          </h1>
          <p className="text-stone-400 text-sm leading-relaxed">
            Upload the original recording. We generate a synthetic voice avatar that
            protects your source's identity and store the original in cryptographic escrow.
            The source reviews the synthetic version before approving publication.
          </p>
        </motion.div>

        {/* Privacy guarantee */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-emerald-950/30 border border-emerald-900/50 rounded-2xl p-5"
        >
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-300 mb-2">Privacy Guarantee</p>
              <ul className="space-y-1 text-xs text-emerald-400/80">
                <li>• Original audio is encrypted with PBKDF2 + XOR before storage</li>
                <li>• Escrow can only be retrieved with source approval and judicial order</li>
                <li>• Synthetic avatar preserves speech content, not voice identity</li>
                <li>• Zero raw audio transmitted to any third party</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Form */}
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.15 }}
              onSubmit={handleSubmit}
              className="bg-[#1a2119] border border-emerald-900/30 rounded-2xl overflow-hidden
                         shadow-[0_0_60px_rgba(0,0,0,0.4)]"
            >
              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-start gap-3 px-5 py-4 bg-red-950/50 border-b border-red-900/60">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-300 flex-1">{error}</p>
                      <button type="button" onClick={() => setError(null)}
                        className="text-red-500 hover:text-red-300 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="p-6 sm:p-8 space-y-6">

                {/* Drop zone */}
                <div
                  {...getRootProps()}
                  className={[
                    'relative rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                    isDragActive
                      ? 'border-indigo-500 bg-emerald-700/10'
                      : file
                      ? 'border-emerald-900/30 bg-[#243028]/40'
                      : 'border-emerald-900/30 hover:border-emerald-500/50 hover:bg-emerald-700/6',
                  ].join(' ')}
                >
                  <input {...getInputProps()} />
                  <AnimatePresence mode="wait">
                    {file ? (
                      <motion.div
                        key="file"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="p-5 flex items-center gap-4"
                      >
                        <div className="w-12 h-12 rounded-lg bg-[#243028] border border-emerald-900/30
                                        flex items-center justify-center flex-shrink-0">
                          {file.type.startsWith('video/')
                            ? <FileVideo className="w-6 h-6 text-emerald-400" />
                            : <FileAudio className="w-6 h-6 text-emerald-400" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-emerald-50 truncate">{file.name}</p>
                          <p className="text-xs text-stone-500 mt-0.5">{formatBytes(file.size)}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-xs text-emerald-400 font-mono">READY</span>
                          </div>
                        </div>
                        <button type="button" onClick={removeFile}
                          className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-50
                                     hover:bg-emerald-900/40 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="idle"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="py-10 text-center"
                      >
                        <motion.div
                          animate={{ scale: [1, 1.06, 1] }}
                          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                          className="inline-flex items-center justify-center w-12 h-12 rounded-full
                                     bg-[#243028] border border-emerald-900/30 mb-4"
                        >
                          <Mic className="w-5 h-5 text-stone-400" />
                        </motion.div>
                        <p className="text-stone-300 font-medium mb-1">
                          Drop audio or video recording here
                        </p>
                        <p className="text-stone-600 text-sm">
                          MP3, WAV, FLAC, M4A, MP4, MOV — up to 200 MB
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Source & journalist fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-stone-500 uppercase tracking-wider">
                      Source Code Name *
                    </label>
                    <input
                      type="text"
                      value={sourceName}
                      onChange={e => setSourceName(e.target.value)}
                      placeholder="e.g. Nightingale"
                      className="w-full bg-[#243028]/60 border border-emerald-900/30 rounded-xl px-4 py-3
                                 text-sm text-emerald-100 placeholder-zinc-600
                                 focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-stone-500 uppercase tracking-wider">
                      Journalist Name *
                    </label>
                    <input
                      type="text"
                      value={journoName}
                      onChange={e => setJournoName(e.target.value)}
                      placeholder="Your name"
                      className="w-full bg-[#243028]/60 border border-emerald-900/30 rounded-xl px-4 py-3
                                 text-sm text-emerald-100 placeholder-zinc-600
                                 focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                  </div>
                </div>

                {/* Style descriptor */}
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-stone-500 uppercase tracking-wider">
                    Avatar Voice Style
                  </label>
                  <select
                    value={style}
                    onChange={e => setStyle(e.target.value)}
                    className="w-full bg-[#243028]/60 border border-emerald-900/30 rounded-xl px-4 py-3
                               text-sm text-emerald-100 focus:outline-none focus:border-emerald-500/50
                               transition-colors"
                  >
                    <option value="neutral">Neutral</option>
                    <option value="formal">Formal</option>
                    <option value="whisper">Whisper</option>
                    <option value="elderly">Elderly</option>
                    <option value="young">Young</option>
                  </select>
                </div>

                {/* Submit */}
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={!loading ? { scale: 1.01 } : {}}
                  whileTap={!loading  ? { scale: 0.99 } : {}}
                  className={[
                    'w-full h-14 rounded-xl font-semibold text-sm flex items-center justify-center gap-3',
                    'transition-all duration-300',
                    loading
                      ? 'bg-emerald-800/50 text-emerald-300 cursor-wait border border-emerald-700/30'
                      : 'bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer',
                  ].join(' ')}
                >
                  <AnimatePresence mode="wait">
                    {loading ? (
                      <motion.span
                        key={stageIdx}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="flex items-center gap-2.5"
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <Shield className="w-4 h-4" />
                        </motion.div>
                        {STAGES[stageIdx]}
                      </motion.span>
                    ) : (
                      <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        Protect Source
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>

              </div>
            </motion.form>
          ) : (
            /* ── Result ─────────────────────────────────────────────────────── */
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* Success header */}
              <div className="bg-[#1a2119] border border-emerald-900/30 rounded-2xl p-6 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-600/10 border border-emerald-500/20
                                flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                </div>
                <p className="text-lg font-black text-emerald-50">Source Sealed Successfully</p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
                                bg-[#243028] border border-emerald-900/30 text-xs font-mono text-stone-400">
                  <Lock className="w-3 h-3" />
                  ESCROW ID: {result.escrow?.escrow_id ?? '—'}
                </div>
              </div>

              {/* Synthetic audio playback */}
              {result.avatar?.synthetic_audio_path && (
                <div className="bg-[#1a2119] border border-emerald-900/30 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Eye className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-100">
                      Review Synthetic Avatar
                    </span>
                  </div>
                  <p className="text-xs text-stone-500">
                    Listen to the synthetic version before the source approves.
                    The original voice has been replaced with a generated avatar.
                  </p>
                  <AudioPlayer
                    src={`/api/uploads/${result.avatar.synthetic_audio_path.split('/').pop()}`}
                    label="Synthetic Voice Avatar"
                  />
                  <a
                    href={`/api/uploads/${result.avatar.synthetic_audio_path.split('/').pop()}`}
                    download
                    className="flex items-center gap-2 w-fit px-4 h-9 rounded-xl
                               bg-[#243028] border border-emerald-900/30 text-stone-400
                               hover:text-emerald-50 text-sm transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Avatar
                  </a>
                </div>
              )}

              {/* Approval */}
              <div className="bg-[#1a2119] border border-emerald-900/30 rounded-2xl p-6 space-y-4">
                <p className="text-sm text-stone-300 leading-relaxed">
                  Share the synthetic audio with your source for review.
                  Once they confirm the content is accurately represented,
                  click the approval button below.
                </p>
                {approved ? (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl
                                  bg-emerald-950/40 border border-emerald-900/50">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-emerald-300 font-semibold">
                      Source has approved this version
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500
                               text-white text-sm font-semibold transition-colors
                               flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {approving ? 'Approving…' : 'Source has approved this version'}
                  </button>
                )}
                <button
                  onClick={() => { setResult(null); setFile(null); setSourceName(''); setJournoName('') }}
                  className="w-full h-10 rounded-xl border border-emerald-900/30 text-stone-400
                             hover:text-emerald-50 text-sm transition-colors"
                >
                  Protect another source
                </button>
              </div>

              {/* Legal disclaimer */}
              <div className="bg-[#1a2119]/60 border border-emerald-900/30 rounded-xl px-5 py-4">
                <p className="text-[11px] text-stone-600 leading-relaxed font-mono">
                  LEGAL NOTICE: The original recording is stored in encrypted escrow under
                  SynthShield's Source Seal protocol. Retrieval requires (a) written approval
                  from the source via secure channel, and (b) a valid judicial order or
                  senior editorial authorization. Unauthorized access attempts are logged and
                  may constitute a criminal offence under applicable press freedom legislation.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  )
}

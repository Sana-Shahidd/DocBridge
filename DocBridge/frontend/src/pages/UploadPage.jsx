import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, AlertCircle, X, FileImage, FileVideo, FileAudio,
  MapPin, MessageSquare, Loader2, ChevronRight, Zap, Lock,
  Shield, Brain, Globe, Newspaper,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { analyzeFile } from '../api/synthshield'

// ── Constants ─────────────────────────────────────────────────────────────────
const ACCEPTED_MIME = {
  'image/jpeg':      ['.jpg', '.jpeg'],
  'image/png':       ['.png'],
  'image/webp':      ['.webp'],
  'image/bmp':       ['.bmp'],
  'video/mp4':       ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/webm':      ['.webm'],
  'audio/mpeg':      ['.mp3'],
  'audio/wav':       ['.wav'],
  'audio/ogg':       ['.ogg'],
  'audio/mp4':       ['.m4a'],
  'audio/flac':      ['.flac'],
}

const FORMAT_BADGES = [
  { label: 'JPG / PNG / WebP', icon: FileImage },
  { label: 'MP4 / MOV / AVI',  icon: FileVideo },
  { label: 'MP3 / WAV / FLAC', icon: FileAudio },
]

const SIZE_LIMITS = {
  image: 50  * 1024 * 1024,   // 50 MB
  video: 500 * 1024 * 1024,   // 500 MB
  audio: 100 * 1024 * 1024,   // 100 MB
}

const LOADING_STAGES = [
  { label: 'Validating...',              icon: Shield    },
  { label: 'Extracting quantum signals...', icon: Zap   },
  { label: 'Running AI analysis...',     icon: Brain     },
  { label: 'Geolocating content...',     icon: Globe     },
  { label: 'Verifying news context...',  icon: Newspaper },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function getMediaCategory(mimeType) {
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('video/')) return 'video'
  if (mimeType?.startsWith('audio/')) return 'audio'
  return null
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileTypeIcon({ type, className = 'w-6 h-6' }) {
  if (type === 'video') return <FileVideo className={className} />
  if (type === 'audio') return <FileAudio className={className} />
  return <FileImage className={className} />
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UploadPage() {
  const navigate = useNavigate()

  const [file,            setFile]            = useState(null)
  const [preview,         setPreview]         = useState(null)   // data-URL for images
  const [contextText,     setContextText]     = useState('')
  const [claimedLocation, setClaimedLocation] = useState('')
  const [error,           setError]           = useState(null)
  const [isLoading,       setIsLoading]       = useState(false)
  const [stageIdx,        setStageIdx]        = useState(0)
  const stageTimer = useRef(null)

  // Cycle loading stages while submitting
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isLoading) { setStageIdx(0); return }
    stageTimer.current = setInterval(() => {
      setStageIdx(i => (i + 1) % LOADING_STAGES.length)
    }, 1900)
    return () => clearInterval(stageTimer.current)
  }, [isLoading])

  // Clean up image preview URL on unmount / file change
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const validateFile = useCallback((f) => {
    const category = getMediaCategory(f.type)
    if (!category) return `Unsupported file type: ${f.type || f.name}`
    const limit = SIZE_LIMITS[category]
    if (f.size > limit) {
      return `File too large (${formatBytes(f.size)}). Max for ${category}: ${formatBytes(limit)}.`
    }
    return null
  }, [])

  const onDrop = useCallback((accepted, rejected) => {
    setError(null)

    if (rejected?.length) {
      const reason = rejected[0].errors?.[0]
      if (reason?.code === 'file-too-large') {
        setError('File exceeds the maximum allowed size.')
      } else if (reason?.code === 'file-invalid-type') {
        setError('Unsupported file type. Accepted: JPEG, PNG, WebP, BMP, MP4, MOV, AVI, WebM, MP3, WAV, OGG, M4A, FLAC.')
      } else {
        setError(reason?.message ?? 'File rejected.')
      }
      return
    }

    if (!accepted?.length) return
    const f = accepted[0]
    const validationError = validateFile(f)
    if (validationError) { setError(validationError); return }

    setFile(f)
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f)
      setPreview(url)
    } else {
      setPreview(null)
    }
  }, [validateFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept:      ACCEPTED_MIME,
    maxFiles:    1,
    maxSize:     500 * 1024 * 1024,
    noClick:     false,
    noKeyboard:  false,
  })

  const removeFile = (e) => {
    e.stopPropagation()
    setFile(null)
    setPreview(null)
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) { setError('Please select a file to analyze.'); return }

    setError(null)
    setIsLoading(true)

    const form = new FormData()
    form.append('file', file)
    if (contextText.trim())     form.append('context_text',     contextText.trim())
    if (claimedLocation.trim()) form.append('claimed_location', claimedLocation.trim())

    try {
      const data = await analyzeFile(
        file,
        contextText.trim()     || undefined,
        claimedLocation.trim() || undefined,
        () => {},
      )
      navigate(`/results/${data.analysis_id}`, { state: data })
    } catch (err) {
      const detail = err.response?.data?.detail
      if (detail && typeof detail === 'object') {
        setError(detail.detail ?? detail.error ?? 'Analysis failed.')
      } else if (typeof detail === 'string') {
        setError(detail)
      } else {
        setError(err.message ?? 'Network error. Make sure the SynthShield server is running.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const currentStage = LOADING_STAGES[stageIdx]
  const StageIcon    = currentStage.icon
  const mediaType    = file ? getMediaCategory(file.type) : null

  return (
    <div className="min-h-screen grid-bg">
      {/* Ambient glow — top center */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px]
                   bg-emerald-700/6 rounded-full blur-3xl"
      />

      <main className="relative max-w-3xl mx-auto px-6 pt-28 pb-20">

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                       bg-emerald-700/12 border border-emerald-600/25 text-emerald-400
                       text-xs font-mono tracking-wider mb-6"
          >
            <Lock className="w-3 h-3" />
            QUANTUM FORENSIC ANALYSIS
          </motion.div>

          <h1 className="text-6xl sm:text-7xl font-black tracking-tighter leading-none mb-4">
            <span className="text-emerald-50">Is it </span>
            <span className="gradient-text">real?</span>
          </h1>

          <p className="text-stone-400 text-lg max-w-xl mx-auto leading-relaxed">
            Upload any image, video, or audio clip. Our quantum-assisted AI
            cross-checks noise signatures, metadata, geolocation, and live
            news sources in seconds.
          </p>
        </motion.div>

        {/* ── Main form card ─────────────────────────────────────────────── */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="bg-[#1a2119] border border-emerald-900/30 rounded-2xl overflow-hidden
                     shadow-[0_0_60px_rgba(0,0,0,0.4)]"
        >
          {/* Error banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="flex items-start gap-3 px-5 py-4 bg-red-950/50 border-b border-red-900/60">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300 flex-1">{error}</p>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="text-red-500 hover:text-red-300 transition-colors"
                    aria-label="Dismiss error"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-6 sm:p-8 space-y-6">

            {/* ── Drop zone ──────────────────────────────────────────────── */}
            <div>
              <div
                {...getRootProps()}
                className={[
                  'relative rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
                  isDragActive
                    ? 'border-emerald-500 bg-emerald-700/10 glow-indigo'
                    : file
                    ? 'border-emerald-900/40 bg-[#243028]/50'
                    : 'border-emerald-900/40 hover:border-emerald-500/50 hover:bg-emerald-700/6',
                ].join(' ')}
              >
                <input {...getInputProps()} />

                <AnimatePresence mode="wait">
                  {file ? (
                    /* ── File selected state ─────────────────────────────── */
                    <motion.div
                      key="file-selected"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="p-5"
                    >
                      <div className="flex items-start gap-4">
                        {/* Image preview or file icon */}
                        <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden
                                        bg-[#243028] border border-emerald-900/30 flex items-center justify-center">
                          {preview ? (
                            <img
                              src={preview}
                              alt="Preview"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <FileTypeIcon
                              type={mediaType}
                              className="w-8 h-8 text-emerald-400"
                            />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-emerald-50 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-stone-500 mt-1">
                            {formatBytes(file.size)} · {mediaType}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                            <span className="text-xs text-emerald-400 font-mono">
                              READY FOR ANALYSIS
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={removeFile}
                          className="flex-shrink-0 p-1.5 rounded-lg text-stone-500
                                     hover:text-emerald-100 hover:bg-emerald-900/30 transition-colors"
                          aria-label="Remove file"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <p className="text-xs text-stone-600 mt-3 text-center">
                        Click or drag to replace
                      </p>
                    </motion.div>

                  ) : isDragActive ? (
                    /* ── Drag-over state ─────────────────────────────────── */
                    <motion.div
                      key="drag-active"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="py-14 text-center"
                    >
                      <motion.div
                        animate={{ scale: [1, 1.15, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        className="inline-flex items-center justify-center w-14 h-14 rounded-full
                                   bg-emerald-700/20 border border-emerald-500/40 mb-4"
                      >
                        <Upload className="w-7 h-7 text-emerald-400" />
                      </motion.div>
                      <p className="text-emerald-300 font-semibold">Release to analyze</p>
                    </motion.div>

                  ) : (
                    /* ── Empty / idle state ──────────────────────────────── */
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="py-12 text-center"
                    >
                      {/* Pulsing upload icon */}
                      <motion.div
                        animate={{ scale: [1, 1.06, 1] }}
                        transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                        className="inline-flex items-center justify-center w-14 h-14 rounded-full
                                   bg-[#243028] border border-emerald-900/40 mb-5"
                      >
                        <Upload className="w-6 h-6 text-stone-400" />
                      </motion.div>

                      <p className="text-stone-300 font-medium mb-1">
                        Drop image, video, or audio here
                      </p>
                      <p className="text-stone-600 text-sm mb-5">
                        or click to browse files
                      </p>

                      {/* Format badges */}
                      <div className="flex items-center justify-center flex-wrap gap-2">
                        {FORMAT_BADGES.map(({ label, icon: Icon }) => (
                          <span
                            key={label}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md
                                       bg-[#243028] border border-emerald-900/30 text-stone-500 text-xs font-mono"
                          >
                            <Icon className="w-3 h-3" />
                            {label}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ── Context input ──────────────────────────────────────────── */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-mono text-stone-500 uppercase tracking-wider">
                <MessageSquare className="w-3.5 h-3.5" />
                News Context
                <span className="text-stone-700 normal-case font-sans tracking-normal">— optional</span>
              </label>
              <textarea
                value={contextText}
                onChange={e => setContextText(e.target.value)}
                placeholder="Describe what this content claims to show — location, date, event. Helps verify against live news sources and geographic analysis."
                rows={3}
                className="w-full bg-[#243028]/60 border border-emerald-900/30 rounded-xl px-4 py-3
                           text-sm text-emerald-100 placeholder-stone-600 resize-none
                           focus:outline-none focus:border-emerald-500/50 focus:bg-[#243028]
                           transition-colors duration-200"
              />
            </div>

            {/* ── Claimed location ───────────────────────────────────────── */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-mono text-stone-500 uppercase tracking-wider">
                <MapPin className="w-3.5 h-3.5" />
                Claimed Location
                <span className="text-stone-700 normal-case font-sans tracking-normal">— optional</span>
              </label>
              <input
                type="text"
                value={claimedLocation}
                onChange={e => setClaimedLocation(e.target.value)}
                placeholder="Where does this content claim to be from? (city, country)"
                className="w-full bg-[#243028]/60 border border-emerald-900/30 rounded-xl px-4 py-3
                           text-sm text-emerald-100 placeholder-stone-600
                           focus:outline-none focus:border-emerald-500/50 focus:bg-[#243028]
                           transition-colors duration-200"
              />
            </div>

            {/* ── Analyze button ─────────────────────────────────────────── */}
            <motion.button
              type="submit"
              disabled={isLoading || !file}
              whileHover={!isLoading && file ? { scale: 1.01 } : {}}
              whileTap={!isLoading && file  ? { scale: 0.99 } : {}}
              className={[
                'w-full h-14 rounded-xl font-semibold text-sm flex items-center justify-center gap-3',
                'transition-all duration-300',
                isLoading
                  ? 'bg-emerald-800/50 text-emerald-300 cursor-wait border border-emerald-700/30'
                  : file
                  ? 'bg-emerald-700 hover:bg-emerald-600 text-white glow-indigo-sm cursor-pointer'
                  : 'bg-[#243028] text-stone-600 cursor-not-allowed border border-emerald-900/30',
              ].join(' ')}
            >
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.span
                    key={stageIdx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center gap-2.5"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Loader2 className="w-4 h-4" />
                    </motion.div>
                    <StageIcon className="w-4 h-4 text-emerald-400" />
                    {currentStage.label}
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2"
                  >
                    <Shield className="w-4 h-4" />
                    Analyze Media
                    <ChevronRight className="w-4 h-4 opacity-60" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

          </div>
        </motion.form>

        {/* ── Signal legend ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3"
        >
          {[
            { icon: Zap,       label: 'Quantum Noise',   desc: 'QSAM / QFT analysis' },
            { icon: Brain,     label: 'CNN Deepfake',    desc: 'EfficientNet-B4' },
            { icon: Shield,    label: 'Metadata ELA',    desc: 'EXIF forensics' },
            { icon: Globe,     label: 'GeoLens',         desc: 'Visual location match' },
            { icon: Newspaper, label: 'News Context',    desc: 'Live source cross-check' },
            { icon: Lock,      label: 'Audio Clone',     desc: 'RawNet2 voice detection' },
          ].map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex items-start gap-2.5 p-3 rounded-xl bg-[#1a2119]/60
                         border border-emerald-900/20 group"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-700/12 border border-emerald-600/20
                              flex items-center justify-center flex-shrink-0 mt-0.5
                              group-hover:bg-emerald-700/25 transition-colors">
                <Icon className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-300">{label}</p>
                <p className="text-[11px] text-stone-600 mt-0.5 font-mono">{desc}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* ── Footer note ────────────────────────────────────────────────── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-center text-xs text-stone-700 mt-8 font-mono"
        >
          Files are processed in-memory and not stored beyond the session.
          Certificates are signed with HMAC-SHA256.
        </motion.p>

      </main>
    </div>
  )
}

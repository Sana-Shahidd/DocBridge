import { useState, useRef, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { analyzeFile } from '../api/synthshield'

/**
 * Stages the backend pipeline moves through (frontend approximation).
 * The real work happens on the server; we cycle these to keep the UI alive.
 */
const STAGES = [
  'idle',
  'validating',
  'extracting',
  'geolocating',
  'classifying',
  'verifying',
  'complete',
]

const STAGE_LABELS = {
  idle:        'Ready',
  validating:  'Validating file…',
  extracting:  'Extracting quantum signals…',
  geolocating: 'Geolocating content…',
  classifying: 'Running AI classifier…',
  verifying:   'Verifying news context…',
  complete:    'Analysis complete',
  error:       'Analysis failed',
}

/** Interval between synthetic stage advances while server is working (ms). */
const STAGE_INTERVAL = 1900

export function useAnalysis() {
  const [stage,       setStage]       = useState('idle')
  const [uploadPct,   setUploadPct]   = useState(0)
  const timerRef = useRef(null)

  function _startStaging() {
    let i = 1                         // start at 'validating'
    setStage(STAGES[i])
    timerRef.current = setInterval(() => {
      i = Math.min(i + 1, STAGES.length - 2)   // stop just before 'complete'
      setStage(STAGES[i])
    }, STAGE_INTERVAL)
  }

  function _stopStaging() {
    clearInterval(timerRef.current)
    timerRef.current = null
  }

  const mutation = useMutation({
    mutationFn: ({ file, contextText, claimedLocation }) =>
      analyzeFile(file, contextText, claimedLocation, pct => setUploadPct(pct)),

    onMutate() {
      setUploadPct(0)
      _startStaging()
    },

    onSuccess() {
      _stopStaging()
      setStage('complete')
    },

    onError() {
      _stopStaging()
      setStage('error')
    },
  })

  const analyze = useCallback((file, contextText = '', claimedLocation = '') => {
    mutation.mutate({ file, contextText, claimedLocation })
  }, [mutation])

  const reset = useCallback(() => {
    _stopStaging()
    setStage('idle')
    setUploadPct(0)
    mutation.reset()
  }, [mutation])

  return {
    /** Call this to start an analysis. */
    analyze,
    /** Reset all state back to idle. */
    reset,
    /** Current pipeline stage key. */
    stage,
    /** Human-readable label for the current stage. */
    stageLabel: STAGE_LABELS[stage] ?? stage,
    /** Upload progress 0-100 (only meaningful during file transfer). */
    uploadPct,
    /** True while the request is in-flight. */
    isLoading: mutation.isPending,
    /** True once the server returned a successful result. */
    isSuccess: mutation.isSuccess,
    /** True if the server returned an error. */
    isError: mutation.isError,
    /** The raw server response on success. */
    data: mutation.data ?? null,
    /** The error object on failure. */
    error: mutation.error ?? null,
  }
}

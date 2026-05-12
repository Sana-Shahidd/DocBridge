/**
 * SynthShield central API client.
 * All paths are relative so the Vite dev-proxy (/api → http://localhost:8000)
 * handles the rewrite in development. In production the reverse proxy does it.
 */
import axios from 'axios'

const http = axios.create({ timeout: 120_000 })

// ── helpers ───────────────────────────────────────────────────────────────────

function formData(obj) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) v.forEach(item => fd.append(k, item))
    else fd.append(k, v)
  }
  return fd
}

// ── Analysis ──────────────────────────────────────────────────────────────────

/**
 * POST /api/analyze/upload
 * @param {File}     file
 * @param {string}   contextText
 * @param {string}   claimedLocation
 * @param {Function} onProgress  — receives 0-100
 */
export async function analyzeFile(file, contextText, claimedLocation, onProgress) {
  const fd = formData({
    file,
    context_text:     contextText     || undefined,
    claimed_location: claimedLocation || undefined,
  })
  const { data } = await http.post('/api/analyze/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress(e) {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  })
  return data
}

/**
 * GET /api/analyze/:id
 * NOTE: requires backend to expose a GET-by-ID endpoint.
 * Falls back gracefully in ResultsPage when 404.
 */
export async function getAnalysisResult(analysisId) {
  const { data } = await http.get(`/api/analyze/${analysisId}`)
  return data
}

// ── Reports ───────────────────────────────────────────────────────────────────

/**
 * POST /api/reports/
 * @param {{ analysis_id, description, platform, contact_email }} reportData
 */
export async function createReport(reportData) {
  const { data } = await http.post('/api/reports/', reportData)
  return data
}

/**
 * GET /api/reports/
 * @param {{ dateFrom, dateTo, scoreMax, skip, limit }} filters
 */
export async function getReports(filters = {}) {
  const params = {}
  if (filters.dateFrom)              params.date_from = filters.dateFrom
  if (filters.dateTo)                params.date_to   = filters.dateTo
  if (filters.scoreMax != null && filters.scoreMax < 100) params.score_max = filters.scoreMax
  if (filters.skip  != null)         params.skip      = filters.skip
  if (filters.limit != null)         params.limit     = filters.limit
  const { data } = await http.get('/api/reports/', { params })
  return data
}

/** Opens /api/reports/export/csv in a new tab → browser triggers download. */
export function exportReportsCSV() {
  window.open('/api/reports/export/csv', '_blank')
}

// ── Certificate ───────────────────────────────────────────────────────────────

/** Opens /api/certificate/:id in a new tab → browser triggers PDF download. */
export function downloadCertificate(analysisId) {
  window.open(`/api/certificate/${analysisId}`, '_blank')
}

// ── Intelligence / patterns ───────────────────────────────────────────────────

/** GET /api/intelligence/patterns */
export async function getCampaignPatterns() {
  const { data } = await http.get('/api/intelligence/patterns')
  return data
}

/**
 * GET /api/intelligence/patterns  (same endpoint, derived stats)
 * Returns { totalAnalyses, avgScore, fakePct, flaggedCount, clusters }
 */
export async function getDashboardStats() {
  const patterns = await getCampaignPatterns()
  const total   = patterns.total_analyses ?? 0
  const flagged = patterns.flagged_count  ?? 0
  const allItems = (patterns.clusters ?? []).flatMap(c => c.analyses ?? [])
  const scores   = allItems.map(a => a.score).filter(Boolean)
  const avgScore = scores.length
    ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
    : null
  return {
    totalAnalyses: total,
    avgScore,
    fakePct:       total ? Math.round((flagged / total) * 100) : 0,
    flaggedCount:  flagged,
    clusters:      patterns.clusters ?? [],
    allAnalyses:   allItems,
    generatedAt:   patterns.generated_at,
  }
}

/** Opens FIA PDF brief for a cluster in a new tab. */
export function downloadIntelligenceBrief(clusterId) {
  window.open(`/api/intelligence/brief/${clusterId}`, '_blank')
}

// ── GeoLens ───────────────────────────────────────────────────────────────────

/**
 * POST /api/geolens/analyze
 * @param {File}   imageFile
 * @param {string} claimedLocation
 * @param {string} claimedDate
 */
export async function analyzeGeolocation(imageFile, claimedLocation, claimedDate) {
  const fd = formData({ file: imageFile, claimed_location: claimedLocation, claimed_date: claimedDate })
  const { data } = await http.post('/api/geolens/analyze', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

// ── Watermark ─────────────────────────────────────────────────────────────────

/**
 * POST /api/watermark/embed
 * @param {File}    imageFile
 * @param {string}  payload
 * @param {boolean} screenResistant
 */
export async function embedWatermark(imageFile, payload, screenResistant = false) {
  const fd = formData({ file: imageFile, payload, screen_resistant: screenResistant })
  const { data } = await http.post('/api/watermark/embed', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

/**
 * POST /api/watermark/extract
 * @param {File} imageFile
 */
export async function extractWatermark(imageFile) {
  const fd = formData({ file: imageFile })
  const { data } = await http.post('/api/watermark/extract', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

// ── PRNU device fingerprinting ────────────────────────────────────────────────

/**
 * POST /api/watermark/prnu/register
 * @param {string}   deviceName
 * @param {string}   orgName
 * @param {File[]}   referenceImages
 */
export async function registerDevice(deviceName, orgName, referenceImages) {
  const fd = new FormData()
  fd.append('device_name', deviceName)
  fd.append('owner_org', orgName ?? '')
  referenceImages.forEach(f => fd.append('reference_images', f))
  const { data } = await http.post('/api/watermark/prnu/register', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

/**
 * POST /api/watermark/prnu/identify
 * @param {File} imageFile
 */
export async function identifyDevice(imageFile) {
  const fd = formData({ file: imageFile })
  const { data } = await http.post('/api/watermark/prnu/identify', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

// ── Source Seal ───────────────────────────────────────────────────────────────

/**
 * POST /api/intelligence/sourceseal/protect
 * @param {File}   audioFile
 * @param {string} sourceName
 * @param {string} journalistName
 * @param {string} styleDescriptor
 */
export async function protectSource(audioFile, sourceName, journalistName, styleDescriptor = 'neutral') {
  const fd = formData({
    file:              audioFile,
    source_name:       sourceName,
    journalist_name:   journalistName,
    style_descriptor:  styleDescriptor,
  })
  const { data } = await http.post('/api/intelligence/sourceseal/protect', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

/**
 * GET /api/intelligence/sourceseal/verify/:escrowId
 * @param {string} escrowId
 * @param {string} verificationKey
 */
export async function verifyEscrow(escrowId, verificationKey = '') {
  const { data } = await http.get(`/api/intelligence/sourceseal/verify/${escrowId}`, {
    params: verificationKey ? { verification_key: verificationKey } : {},
  })
  return data
}

/**
 * POST /api/intelligence/sourceseal/approve/:escrowId
 * @param {string} escrowId
 */
export async function approveEscrow(escrowId) {
  const { data } = await http.post(`/api/intelligence/sourceseal/approve/${escrowId}`)
  return data
}

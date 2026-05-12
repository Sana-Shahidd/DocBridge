// ─────────────────────────────────────────────────────────────────────────────
// Symptom Analysis Route – MediShield AI
//
//  POST /api/analyze-symptoms
//  Body: { symptoms: string, language: 'en'|'ur' }
//
//  Calls Claude to perform medical triage and returns structured JSON.
//  Never gives a diagnosis — only specialization recommendation + urgency.
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const router   = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are a medical triage assistant for Pakistan. Analyze patient symptoms and return JSON only. Do not give diagnoses or prescriptions. Your role is to guide patients to the right specialist and flag emergencies.

Return a single valid JSON object matching this exact schema — no additional text, no markdown, no explanations:
{
  "specialization": "string (the most relevant medical specialty, e.g. Cardiologist, General Physician)",
  "urgencyLevel": "Low" | "Medium" | "High" | "Emergency",
  "possibleConditions": ["string", "string", "string"],
  "recommendedTests": ["string", "string", "string"],
  "warningSigns": ["string"],
  "urduSummary": "string (2-3 sentence plain-language Urdu summary in Urdu script)"
}

Urgency definitions:
- Low: Minor symptoms, no immediate danger (cold, mild rash, fatigue)
- Medium: Symptoms that warrant a timely appointment within days
- High: Symptoms that need same-day medical attention
- Emergency: Potentially life-threatening — patient must call 1122 or go to ER immediately

possibleConditions: up to 3 plausible conditions (NOT diagnoses — frame as "may indicate" possibilities)
recommendedTests: up to 3 relevant diagnostic tests
warningSigns: specific symptoms that would indicate immediate emergency escalation`;

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

router.post('/', async (req, res) => {
  try {
    const { symptoms, language = 'en' } = req.body;

    if (!symptoms || !symptoms.trim()) {
      return res.status(400).json({ success: false, message: 'symptoms text is required.' });
    }
    if (symptoms.trim().length < 8) {
      return res.status(400).json({ success: false, message: 'Please describe your symptoms in more detail.' });
    }

    const client = getClient();
    if (!client) {
      return res.status(503).json({
        success: false,
        message: 'AI analysis service is not configured. Add ANTHROPIC_API_KEY to server .env.',
      });
    }

    const langNote = language === 'ur'
      ? '\n(Note: Patient may have written in Urdu or mixed Urdu/English. Analyze accordingly.)'
      : '';

    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages: [{
        role:    'user',
        content: `Patient symptoms: ${symptoms.trim()}${langNote}`,
      }],
    });

    const raw = message.content[0].text.trim();

    // Strip markdown code fences if Claude wraps the JSON
    const jsonText = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let analysis;
    try {
      analysis = JSON.parse(jsonText);
    } catch {
      console.error('Claude non-JSON response:', raw);
      return res.status(502).json({
        success: false,
        message: 'AI returned an unexpected format. Please try again.',
      });
    }

    // Normalize / sanitize fields
    const VALID_URGENCY = ['Low', 'Medium', 'High', 'Emergency'];
    if (!VALID_URGENCY.includes(analysis.urgencyLevel)) analysis.urgencyLevel = 'Medium';
    if (!analysis.specialization)     analysis.specialization     = 'General Physician';
    if (!Array.isArray(analysis.possibleConditions)) analysis.possibleConditions = [];
    if (!Array.isArray(analysis.recommendedTests))   analysis.recommendedTests   = [];
    if (!Array.isArray(analysis.warningSigns))        analysis.warningSigns       = [];
    if (!analysis.urduSummary)         analysis.urduSummary         = '';

    // Enforce max lengths
    analysis.possibleConditions = analysis.possibleConditions.slice(0, 3);
    analysis.recommendedTests   = analysis.recommendedTests.slice(0, 3);

    res.json({ success: true, analysis });
  } catch (err) {
    console.error('Symptom analysis error:', err);
    if (err.status === 401) {
      return res.status(503).json({ success: false, message: 'Invalid Anthropic API key.' });
    }
    if (err.status === 429) {
      return res.status(429).json({ success: false, message: 'AI service rate limit reached. Please wait a moment and try again.' });
    }
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

module.exports = router;

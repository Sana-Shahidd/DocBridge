import { useState, useRef } from 'react';
import BodyDiagram    from './symptom/BodyDiagram';
import AnalysisResult from './symptom/AnalysisResult';
import EmergencyAlert from './symptom/EmergencyAlert';
import { analyzeSymptoms } from '../api/symptomApi';

// Detect if text contains significant Urdu characters
function detectLanguage(text) {
  const urduChars = (text.match(/[؀-ۿ]/g) || []).length;
  return urduChars > text.length * 0.08 ? 'ur' : 'en';
}

const MIN_CHARS = 10;

export default function SymptomChecker({ onFindDoctors }) {
  const [step,     setStep]     = useState(1);          // 1 = input, 2 = results
  const [symptoms, setSymptoms] = useState('');
  const [language, setLanguage] = useState('en');
  const [autoLang, setAutoLang] = useState(true);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [emergency, setEmergency] = useState(false);
  const textareaRef = useRef(null);

  function handleSymptomsChange(e) {
    const val = e.target.value;
    setSymptoms(val);
    setError('');
    if (autoLang && val.length > 12) {
      setLanguage(detectLanguage(val));
    }
  }

  // Called from BodyDiagram when user clicks a body part
  function handleBodyPartClick(phrase, adding) {
    setSymptoms((prev) => {
      const trimmed = prev.trim();
      if (!adding) {
        // Remove the phrase
        return trimmed
          .replace(`, ${phrase}`, '')
          .replace(`${phrase}, `, '')
          .replace(phrase, '')
          .replace(/,\s*,/g, ',')
          .trim()
          .replace(/^,\s*/, '')
          .replace(/,\s*$/, '');
      }
      return trimmed ? `${trimmed}, ${phrase}` : phrase;
    });
    // Focus the textarea so user sees the update
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  async function handleAnalyze() {
    const trimmed = symptoms.trim();
    if (trimmed.length < MIN_CHARS) {
      setError(`Please describe your symptoms in more detail (at least ${MIN_CHARS} characters).`);
      textareaRef.current?.focus();
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await analyzeSymptoms({ symptoms: trimmed, language });
      if (!result.success) throw new Error(result.message);
      setAnalysis(result.analysis);
      setStep(2);
      if (result.analysis.urgencyLevel === 'Emergency') {
        setEmergency(true);
      }
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && e.ctrlKey) handleAnalyze();
  }

  function handleReset() {
    setStep(1);
    setAnalysis(null);
    setEmergency(false);
    setError('');
  }

  const charsLeft = symptoms.trim().length;
  const langLabel = language === 'ur' ? '🇵🇰 Urdu detected' : '🇬🇧 English';

  return (
    <div className="w-full">
      {/* Emergency fullscreen overlay */}
      {emergency && <EmergencyAlert onDismiss={() => setEmergency(false)} />}

      {step === 1 ? (
        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* ── LEFT: Input panel ─────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col gap-5 min-w-0">

            {/* Header */}
            <div>
              <h2 className="text-2xl font-extrabold text-gray-900 mb-1">
                AI Symptom Checker
              </h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                Describe what you're feeling and our AI will suggest the right specialist — in seconds.
              </p>
            </div>

            {/* Textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={symptoms}
                onChange={handleSymptomsChange}
                onKeyDown={handleKeyDown}
                rows={6}
                placeholder="Describe your symptoms in detail…&#10;&#10;Example: I have had a severe headache for 3 days, with fever and sensitivity to light. My neck feels stiff.&#10;&#10;یا اردو میں لکھیں۔"
                className={`w-full rounded-2xl border-2 p-4 text-sm resize-none focus:outline-none transition-colors leading-relaxed
                  ${symptoms && language === 'ur' ? 'font-urdu text-right text-base' : ''}
                  ${error ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-gray-200 focus:border-blue-400 bg-white'}
                `}
                dir={language === 'ur' ? 'rtl' : 'ltr'}
              />
              {/* Language indicator */}
              <span className="absolute bottom-3 left-4 text-xs text-gray-400 font-medium">
                {langLabel}
              </span>
              <span className={`absolute bottom-3 right-4 text-xs font-medium ${charsLeft >= MIN_CHARS ? 'text-green-500' : 'text-gray-400'}`}>
                {charsLeft}/{MIN_CHARS}+
              </span>
            </div>

            {error && (
              <p className="text-red-600 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </p>
            )}

            {/* Language toggle */}
            <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-2.5">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoLang}
                    onChange={(e) => setAutoLang(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </label>
                <span className="text-sm text-gray-600 font-medium">Auto-detect language</span>
              </div>
              {!autoLang && (
                <div className="flex gap-1">
                  {['en', 'ur'].map((l) => (
                    <button
                      key={l}
                      onClick={() => setLanguage(l)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${language === l ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'}`}
                    >
                      {l === 'en' ? '🇬🇧 EN' : '🇵🇰 UR'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Analyze button */}
            <button
              onClick={handleAnalyze}
              disabled={loading || charsLeft < MIN_CHARS}
              className="btn-primary py-4 text-base font-bold rounded-2xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyzing your symptoms…
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Analyze Symptoms with AI
                  <span className="text-blue-200 text-sm font-normal">Ctrl+Enter</span>
                </>
              )}
            </button>

            {/* Disclaimer */}
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              This is not medical advice. Always consult a qualified PMDC-registered doctor.
              In emergencies, call <strong>1122</strong>.
            </p>
          </div>

          {/* ── RIGHT: Body diagram ───────────────────────────────────────── */}
          <div className="lg:w-56 flex flex-col items-center gap-3 shrink-0">
            <div className="card py-5 px-4 w-full flex flex-col items-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">
                Where does it hurt?
              </p>
              <BodyDiagram onBodyPartClick={handleBodyPartClick} />
            </div>
          </div>

        </div>
      ) : (
        /* ── STEP 2: Results ─────────────────────────────────────────────── */
        <AnalysisResult
          analysis={analysis}
          onBack={handleReset}
          onFindDoctors={() => onFindDoctors(analysis.specialization)}
        />
      )}
    </div>
  );
}

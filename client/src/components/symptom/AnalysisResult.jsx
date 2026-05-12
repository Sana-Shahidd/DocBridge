// ── Specialization → icon mapping ────────────────────────────────────────────
const SPEC_ICONS = {
  'Cardiologist':        '❤️',
  'Neurologist':         '🧠',
  'Orthopedic Surgeon':  '🦴',
  'Orthopedics':         '🦴',
  'Gastroenterologist':  '🩺',
  'Dermatologist':       '🔬',
  'General Physician':   '🏥',
  'Pulmonologist':       '🫁',
  'ENT Specialist':      '👂',
  'Ophthalmologist':     '👁️',
  'Psychiatrist':        '🧬',
  'Urologist':           '🩺',
  'Gynecologist':        '🩺',
  'Pediatrician':        '👶',
  'Nephrologist':        '🫘',
  'Endocrinologist':     '💊',
  'Rheumatologist':      '🦴',
  'Oncologist':          '🔬',
  'Hematologist':        '🩸',
  'Infectious Disease':  '🦠',
};

const URGENCY_CONFIG = {
  Low:       { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-300',   dot: 'bg-blue-500',   label: 'Low Urgency',    icon: '🟦' },
  Medium:    { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', dot: 'bg-yellow-500', label: 'Medium Urgency', icon: '🟨' },
  High:      { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', dot: 'bg-orange-500', label: 'High Urgency',   icon: '🟧' },
  Emergency: { bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-400',    dot: 'bg-red-600',    label: 'Emergency',      icon: '🔴' },
};

function Section({ title, icon, children }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 uppercase tracking-wide mb-2.5">
        <span>{icon}</span>{title}
      </h3>
      {children}
    </div>
  );
}

function ListItem({ text, variant = 'default' }) {
  const colors = {
    default: 'text-gray-700 before:bg-blue-400',
    warning: 'text-red-700 before:bg-red-500',
  };
  return (
    <li className={`flex items-start gap-2.5 text-sm ${variant === 'warning' ? 'text-red-700' : 'text-gray-700'}`}>
      {variant === 'warning' ? (
        <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd" />
        </svg>
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
      )}
      {text}
    </li>
  );
}

export default function AnalysisResult({ analysis, onBack, onFindDoctors }) {
  const {
    specialization, urgencyLevel, possibleConditions,
    recommendedTests, warningSigns, urduSummary,
  } = analysis;

  const urgency    = URGENCY_CONFIG[urgencyLevel] ?? URGENCY_CONFIG.Medium;
  const specIcon   = SPEC_ICONS[specialization] ?? '🏥';
  const isEmergency = urgencyLevel === 'Emergency';

  return (
    <div className="flex flex-col gap-5">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 self-start transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Analyze again
      </button>

      {/* Urgency banner (pulsing for Emergency) */}
      <div className={`rounded-xl border px-5 py-4 flex items-center gap-4 ${urgency.bg} ${urgency.border} border ${isEmergency ? 'animate-pulse' : ''}`}>
        <div className={`w-3 h-3 rounded-full shrink-0 ${urgency.dot} ${isEmergency ? 'animate-ping' : ''}`} />
        <div className="flex-1">
          <p className={`font-bold text-base ${urgency.text}`}>{urgency.label}</p>
          {isEmergency && (
            <p className="text-red-700 text-sm mt-0.5 font-medium">
              Call 1122 immediately — do not wait for an appointment.
            </p>
          )}
        </div>
        {isEmergency && (
          <a
            href="tel:1122"
            className="shrink-0 bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-red-700 transition-colors"
          >
            📞 1122
          </a>
        )}
      </div>

      {/* Recommended specialization — hero section */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-900 to-blue-600 p-6 text-white">
        <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-2">
          Recommended Specialist
        </p>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center text-4xl shrink-0">
            {specIcon}
          </div>
          <div>
            <h2 className="text-2xl font-extrabold leading-tight">{specialization}</h2>
            <p className="text-blue-200 text-sm mt-1">This specialty best matches your symptoms</p>
          </div>
        </div>
        <button
          onClick={onFindDoctors}
          className="mt-5 w-full bg-white text-blue-800 font-bold rounded-xl py-3 px-5 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Find {specialization} Doctors Now
        </button>
      </div>

      {/* Details grid */}
      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">

        {/* Possible conditions */}
        {possibleConditions.length > 0 && (
          <div className="px-5 py-4">
            <Section title="Possible Conditions" icon="🔍">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                <p className="text-amber-700 text-xs font-medium">
                  ⚕️ These are possibilities only — not a diagnosis. Only a doctor can diagnose you.
                </p>
              </div>
              <ul className="space-y-1.5">
                {possibleConditions.map((c) => <ListItem key={c} text={c} />)}
              </ul>
            </Section>
          </div>
        )}

        {/* Recommended tests */}
        {recommendedTests.length > 0 && (
          <div className="px-5 py-4">
            <Section title="Recommended Tests" icon="🧪">
              <ul className="space-y-1.5">
                {recommendedTests.map((t) => <ListItem key={t} text={t} />)}
              </ul>
            </Section>
          </div>
        )}

        {/* Warning signs */}
        {warningSigns.length > 0 && (
          <div className="px-5 py-4 bg-red-50/40">
            <Section title="Warning Signs — Seek Emergency Care" icon="🚨">
              <p className="text-xs text-red-600 mb-2">If any of these develop, call 1122 immediately:</p>
              <ul className="space-y-1.5">
                {warningSigns.map((w) => <ListItem key={w} text={w} variant="warning" />)}
              </ul>
            </Section>
          </div>
        )}

        {/* Urdu summary */}
        {urduSummary && (
          <div className="px-5 py-4 bg-green-50/40">
            <Section title="اردو خلاصہ" icon="🇵🇰">
              <p
                dir="rtl"
                className="font-urdu text-gray-800 text-base leading-relaxed text-right"
              >
                {urduSummary}
              </p>
            </Section>
          </div>
        )}
      </div>

      {/* Medical disclaimer */}
      <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
        <svg className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd" />
        </svg>
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong className="text-gray-700">Medical Disclaimer:</strong> This analysis is generated by AI for informational purposes only. It is not medical advice and does not replace professional medical consultation. Always consult a qualified, PMDC-registered doctor for diagnosis and treatment. In case of emergency, call <strong>1122</strong>.
        </p>
      </div>
    </div>
  );
}

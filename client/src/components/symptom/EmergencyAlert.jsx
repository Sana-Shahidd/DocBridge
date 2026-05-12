export default function EmergencyAlert({ onDismiss }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-red-600">
      {/* Pulsing ring */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-96 h-96 rounded-full bg-red-500 opacity-30 animate-ping" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 text-center px-6 max-w-md">
        {/* Warning icon */}
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-2xl">
          <svg className="w-14 h-14 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div>
          <h1 className="text-3xl font-black text-white mb-3">
            This May Be an Emergency
          </h1>
          <p className="text-red-100 text-lg leading-relaxed">
            Based on your symptoms, you may need immediate medical attention.
            Do not wait — call emergency services now.
          </p>
        </div>

        {/* Phone number CTA */}
        <a
          href="tel:1122"
          className="flex items-center gap-4 bg-white text-red-700 rounded-2xl px-8 py-5 shadow-2xl hover:bg-red-50 transition-colors"
        >
          <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-red-500">Emergency Services Pakistan</p>
            <p className="text-4xl font-black tracking-wider">1122</p>
            <p className="text-sm text-red-400">Tap to call now</p>
          </div>
        </a>

        {/* Secondary options */}
        <div className="flex gap-3 text-sm text-red-200">
          <a href="tel:115" className="underline hover:text-white">Rescue 115</a>
          <span>·</span>
          <a href="tel:1166" className="underline hover:text-white">Poison Control 1166</a>
        </div>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="mt-2 text-red-200 hover:text-white text-sm underline transition-colors"
        >
          I understand — continue to results
        </button>
      </div>
    </div>
  );
}

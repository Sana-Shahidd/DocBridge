// ─────────────────────────────────────────────────────────────────────────────
// TypingIndicator – MediShield AI
// Three bouncing dots shown inside a bot bubble while the bot "types".
// Each dot is offset by 0.15s so they appear to wave sequentially.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';

export default function TypingIndicator() {
  return (
    // Mimic a bot message bubble
    <div className="flex items-end gap-2 mb-3">
      {/* Bot avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center shadow-sm">
        <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd"
            d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
            clipRule="evenodd" />
        </svg>
      </div>

      {/* Bubble with animated dots */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

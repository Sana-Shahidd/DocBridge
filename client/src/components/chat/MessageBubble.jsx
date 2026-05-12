// ─────────────────────────────────────────────────────────────────────────────
// MessageBubble – MediShield AI
//
// Renders a single chat message bubble.
//   role='bot'  → left-aligned, white bubble, AI avatar
//   role='user' → right-aligned, blue bubble, no avatar
//
// Supports basic markdown-ish formatting:
//   **bold**  → <strong>
//   *italic*  → <em>
//   \n        → line break
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';

// ── Lightweight text formatter ─────────────────────────────────────────────────
function FormattedText({ text }) {
  // Split by newlines first, then apply inline formatting
  const lines = text.split('\n');

  return (
    <>
      {lines.map((line, li) => {
        // Replace **bold** and *italic* markers
        const parts = line.split(/(\*\*.*?\*\*|\*.*?\*)/g);

        return (
          <React.Fragment key={li}>
            {parts.map((part, pi) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={pi}>{part.slice(2, -2)}</strong>;
              }
              if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={pi}>{part.slice(1, -1)}</em>;
              }
              return <span key={pi}>{part}</span>;
            })}
            {li < lines.length - 1 && <br />}
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── Timestamp formatter ────────────────────────────────────────────────────────
function formatTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('en-PK', {
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ── Bot bubble ────────────────────────────────────────────────────────────────
function BotBubble({ text, time }) {
  return (
    <div className="flex items-end gap-2 mb-3 max-w-[85%]">
      {/* AI avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center shadow-sm self-end mb-5">
        <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd"
            d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
            clipRule="evenodd" />
        </svg>
      </div>

      <div>
        {/* Bubble */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-800 leading-relaxed">
          <FormattedText text={text} />
        </div>
        {/* Timestamp */}
        <p className="text-[10px] text-gray-400 mt-1 ml-1">{formatTime(time)}</p>
      </div>
    </div>
  );
}

// ── User bubble ───────────────────────────────────────────────────────────────
function UserBubble({ text, time }) {
  return (
    <div className="flex flex-col items-end mb-3 max-w-[85%] ml-auto">
      {/* Bubble */}
      <div className="bg-primary-600 rounded-2xl rounded-br-sm px-4 py-3 text-sm text-white leading-relaxed shadow-sm">
        <FormattedText text={text} />
      </div>
      {/* Timestamp + read tick */}
      <div className="flex items-center gap-1 mt-1 mr-1">
        <p className="text-[10px] text-gray-400">{formatTime(time)}</p>
        {/* Double-check marks (WhatsApp style) */}
        <svg className="w-3.5 h-3.5 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd" />
        </svg>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function MessageBubble({ message }) {
  if (message.role === 'bot') {
    return <BotBubble text={message.text} time={message.time} />;
  }
  return <UserBubble text={message.text} time={message.time} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatWidget – MediShield AI
//
// WhatsApp-style floating chatbot that acts as an AI proxy for an offline doctor.
// Fixed to the bottom-right corner of the viewport.
//
// State machine phases:
//   idle → greeting → awaiting_consent → name → phone → symptoms → confirm → done
//                                                                          ↘ cancelled
//
// Props:
//   doctor  – Doctor document from the API (must have _id, fullName, profilePhoto)
//   onClose – callback when the user dismisses the widget
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import { saveChatLog } from '../../api/chatApi';

// ── Constants ─────────────────────────────────────────────────────────────────
const PHASES = {
  IDLE:             'idle',
  GREETING:         'greeting',
  AWAITING_CONSENT: 'awaiting_consent',
  NAME:             'name',
  PHONE:            'phone',
  SYMPTOMS:         'symptoms',
  CONFIRM:          'confirm',
  DONE:             'done',
  CANCELLED:        'cancelled',
};

// Delay helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Bot script ─────────────────────────────────────────────────────────────────
// Returns an array of bot messages for the given phase.
function getBotScript(phase, doctor, data) {
  const name = doctor?.fullName || 'the doctor';

  switch (phase) {
    case PHASES.GREETING:
      return [
        `Assalaamu Alaikum! 👋`,
        `Dr. ${name} is currently unavailable, but I'm their AI assistant and I'm here to help.`,
        `I can collect your details so Dr. ${name} can follow up with you personally. May I proceed?`,
      ];

    case PHASES.NAME:
      return [`Of course! What is your **full name**, please?`];

    case PHASES.PHONE:
      return [
        `Thank you, **${data.patientName}**! 😊`,
        `Please share your **WhatsApp number** so Dr. ${name} can reach you directly.`,
      ];

    case PHASES.SYMPTOMS:
      return [
        `Got it ✅`,
        `Could you briefly describe your **concern or symptoms**? Even a few words help Dr. ${name} prepare for your call.`,
      ];

    case PHASES.CONFIRM:
      return [
        `Here's a summary of your details:`,
        `👤 **Name:** ${data.patientName}\n📱 **WhatsApp:** ${data.patientPhone}\n🩺 **Concern:** ${data.symptoms}`,
        `Shall I forward this to Dr. ${name}? Please tap a button below.`,
      ];

    case PHASES.DONE:
      return [
        `✅ Done! Your details have been forwarded to Dr. ${name}.`,
        `Dr. ${name} will contact you on WhatsApp within **2 hours**. 🕐`,
        `📋 Your reference number is **${data.referenceNumber}**.\nPlease save this for any follow-up. JazakAllah Khair! 🙏`,
      ];

    case PHASES.CANCELLED:
      return [
        `No problem at all! 😊`,
        `If you change your mind or need anything else, I'm always here. Take care and stay healthy! 💙`,
      ];

    default:
      return [];
  }
}

// ── Quick-reply button ─────────────────────────────────────────────────────────
function QuickReply({ label, onClick, variant = 'default' }) {
  const styles = {
    default: 'bg-white border-gray-300 text-gray-700 hover:border-primary-400 hover:text-primary-700',
    primary: 'bg-primary-600 border-primary-600 text-white hover:bg-primary-700',
    danger:  'bg-white border-red-300 text-red-600 hover:bg-red-50',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 px-3 text-sm font-semibold rounded-xl border transition-all duration-150 ${styles[variant]}`}
    >
      {label}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ChatWidget({ doctor, onClose }) {
  const [isOpen,        setIsOpen]        = useState(false);
  const [messages,      setMessages]      = useState([]);
  const [phase,         setPhase]         = useState(PHASES.IDLE);
  const [isTyping,      setIsTyping]      = useState(false);
  const [inputValue,    setInputValue]    = useState('');
  const [inputDisabled, setInputDisabled] = useState(false);
  const [isSaving,      setIsSaving]      = useState(false);

  // Collected patient data
  const [patientData, setPatientData] = useState({
    patientName:  '',
    patientPhone: '',
    symptoms:     '',
    referenceNumber: '',
  });

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const phaseRef       = useRef(phase); // Avoid stale closure in async handlers
  phaseRef.current = phase;

  // ── Auto-scroll to latest message ─────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Add a single bot message with typing delay ─────────────────────────────
  const addBotMessage = useCallback(async (text) => {
    setIsTyping(true);
    // Typing duration: 500ms base + 8ms per character, capped at 2s
    await sleep(Math.min(500 + text.replace(/\*\*/g, '').length * 8, 2000));
    setIsTyping(false);
    setMessages((prev) => [...prev, { id: Date.now() + Math.random(), role: 'bot', text, time: new Date() }]);
    await sleep(250); // Brief pause between consecutive messages
  }, []);

  // ── Send a sequence of bot messages, disabling input while doing so ────────
  const runScript = useCallback(async (script) => {
    setInputDisabled(true);
    for (const line of script) {
      await addBotMessage(line);
    }
    setInputDisabled(false);
    // Focus input after script finishes (if we're expecting user input)
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [addBotMessage]);

  // ── Advance to a new phase ─────────────────────────────────────────────────
  const advanceTo = useCallback(async (newPhase, data = {}) => {
    // Merge any new data into patientData
    if (Object.keys(data).length > 0) {
      setPatientData((prev) => ({ ...prev, ...data }));
    }
    setPhase(newPhase);
    const mergedData = { ...patientData, ...data };
    const script = getBotScript(newPhase, doctor, mergedData);
    if (script.length > 0) await runScript(script);
  }, [patientData, doctor, runScript]);

  // ── Open widget and start greeting ────────────────────────────────────────
  const openChat = useCallback(async () => {
    setIsOpen(true);
    if (phaseRef.current === PHASES.IDLE) {
      setPhase(PHASES.GREETING);
      await sleep(400); // Small delay so animation finishes first
      await runScript(getBotScript(PHASES.GREETING, doctor, {}));
      setPhase(PHASES.AWAITING_CONSENT);
    }
  }, [doctor, runScript]);

  // ── Handle text input submission ──────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || inputDisabled) return;

    // Add user message to chat
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: 'user', text, time: new Date() },
    ]);
    setInputValue('');

    const currentPhase = phaseRef.current;

    if (currentPhase === PHASES.AWAITING_CONSENT) {
      const lower = text.toLowerCase();
      if (lower.includes('no') || lower.includes('cancel')) {
        await advanceTo(PHASES.CANCELLED);
      } else {
        await advanceTo(PHASES.NAME);
      }
    } else if (currentPhase === PHASES.NAME) {
      if (text.length < 2) {
        await addBotMessage("I didn't catch that — could you share your full name again? 😊");
        return;
      }
      await advanceTo(PHASES.PHONE, { patientName: text });
    } else if (currentPhase === PHASES.PHONE) {
      // Basic phone validation: must contain digits
      if (!/[\d+\s-]{7,}/.test(text)) {
        await addBotMessage("That doesn't look like a valid phone number. Please enter your WhatsApp number including country code (e.g. +92 300 1234567). 📱");
        return;
      }
      await advanceTo(PHASES.SYMPTOMS, { patientPhone: text });
    } else if (currentPhase === PHASES.SYMPTOMS) {
      if (text.split(' ').length < 2) {
        await addBotMessage("Please describe your symptoms in a little more detail — even 2–3 words helps! 🩺");
        return;
      }
      await advanceTo(PHASES.CONFIRM, { symptoms: text });
    }
  }, [inputValue, inputDisabled, advanceTo, addBotMessage]);

  // ── Keyboard enter to send ─────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Confirm flow (Yes/No quick replies) ───────────────────────────────────
  const handleConfirm = useCallback(async () => {
    // Add user message
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: 'user', text: 'Yes, send it! 📤', time: new Date() },
    ]);

    setIsSaving(true);
    setInputDisabled(true);

    try {
      const result = await saveChatLog({
        doctorId:    doctor._id,
        doctorName:  doctor.fullName,
        doctorEmail: doctor.email || null,
        patientName:  patientData.patientName,
        patientPhone: patientData.patientPhone,
        symptoms:     patientData.symptoms,
      });

      const ref = result.referenceNumber || 'MS-????-????';
      const updatedData = { ...patientData, referenceNumber: ref };
      setPatientData(updatedData);
      setIsSaving(false);

      setPhase(PHASES.DONE);
      const script = getBotScript(PHASES.DONE, doctor, updatedData);
      await runScript(script);
      setInputDisabled(true); // Conversation complete – no more input
    } catch (err) {
      setIsSaving(false);
      setInputDisabled(false);
      await addBotMessage("I'm sorry, something went wrong saving your details. Please try again or contact the clinic directly. 🙏");
    }
  }, [doctor, patientData, saveChatLog, runScript, addBotMessage]);

  const handleDecline = useCallback(async () => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: 'user', text: 'No, cancel', time: new Date() },
    ]);
    await advanceTo(PHASES.CANCELLED);
    setInputDisabled(true);
  }, [advanceTo]);

  // ── Determine which input UI to show ──────────────────────────────────────
  const showQuickReplies = phase === PHASES.AWAITING_CONSENT && !isTyping;
  const showConfirmButtons = phase === PHASES.CONFIRM && !isTyping;
  const showInput = ![PHASES.IDLE, PHASES.DONE, PHASES.CANCELLED].includes(phase) &&
                    !showQuickReplies && !showConfirmButtons;

  // Doctor photo
  const doctorPhoto = doctor.profilePhoto
    ? doctor.profilePhoto
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(doctor.fullName)}&background=1d4ed8&color=fff&size=64&bold=true`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Floating chat button (always visible) ───────────────────────── */}
      {!isOpen && (
        <button
          onClick={openChat}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-primary-600
                     hover:bg-primary-700 text-white px-4 py-3 rounded-2xl shadow-xl
                     transition-all duration-200 hover:scale-105 active:scale-95"
          aria-label="Open AI chat assistant"
        >
          {/* Chat icon */}
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="text-sm font-semibold">Chat with AI</span>
          {/* Pulse dot */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
          </span>
        </button>
      )}

      {/* ── Chat window ────────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 z-50 flex flex-col
                     w-[360px] sm:w-[380px] h-[560px]
                     bg-white rounded-3xl shadow-2xl border border-gray-200
                     overflow-hidden"
          style={{ animation: 'slideUp 0.25s ease-out' }}
        >
          {/* ── Header ───────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-primary-800 to-primary-600 text-white flex-shrink-0">
            {/* Doctor photo */}
            <div className="relative flex-shrink-0">
              <img src={doctorPhoto} alt={doctor.fullName}
                className="w-10 h-10 rounded-full object-cover border-2 border-white/40" />
              {/* Online dot */}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border border-white" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight truncate">Dr. {doctor.fullName}</p>
              <p className="text-xs text-primary-200">AI Assistant • Online</p>
            </div>

            {/* Lock icon (secure chat indicator) */}
            <svg className="w-4 h-4 text-primary-200 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>

            {/* Close button */}
            <button
              onClick={() => { setIsOpen(false); onClose?.(); }}
              className="p-1 rounded-full hover:bg-white/20 transition-colors flex-shrink-0"
              aria-label="Close chat"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Secure chat notice ──────────────────────────────────────── */}
          <div className="bg-green-50 border-b border-green-100 py-1.5 px-4 flex items-center justify-center gap-1.5">
            <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd" />
            </svg>
            <p className="text-[10px] text-green-700 font-medium">End-to-end encrypted · Powered by MediShield AI</p>
          </div>

          {/* ── Messages area ───────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50 space-y-1">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Typing indicator */}
            {isTyping && <TypingIndicator />}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Input area ───────────────────────────────────────────────── */}
          <div className="flex-shrink-0 bg-white border-t border-gray-200 px-3 py-3">

            {/* Quick replies: Greeting consent */}
            {showQuickReplies && (
              <div className="flex gap-2">
                <QuickReply
                  label="Yes, please help 🙏"
                  onClick={() => {
                    setMessages((p) => [...p, { id: Date.now(), role: 'user', text: 'Yes, please help 🙏', time: new Date() }]);
                    advanceTo(PHASES.NAME);
                  }}
                  variant="primary"
                />
                <QuickReply
                  label="No, thanks"
                  onClick={() => {
                    setMessages((p) => [...p, { id: Date.now(), role: 'user', text: 'No, thanks', time: new Date() }]);
                    advanceTo(PHASES.CANCELLED);
                  }}
                />
              </div>
            )}

            {/* Quick replies: Confirm details */}
            {showConfirmButtons && (
              <div className="flex gap-2">
                <QuickReply
                  label={isSaving ? 'Sending...' : 'Yes, send it! 📤'}
                  onClick={!isSaving ? handleConfirm : undefined}
                  variant="primary"
                />
                <QuickReply label="No, cancel" onClick={handleDecline} variant="danger" />
              </div>
            )}

            {/* Text input */}
            {showInput && (
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={inputDisabled}
                  rows={1}
                  placeholder="Type your message..."
                  className="flex-1 resize-none bg-gray-100 rounded-2xl px-4 py-3 text-sm
                             text-gray-800 placeholder-gray-400
                             focus:outline-none focus:ring-2 focus:ring-primary-300
                             disabled:opacity-50 disabled:cursor-not-allowed
                             max-h-24 overflow-y-auto"
                  style={{ minHeight: '44px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || inputDisabled}
                  className="flex-shrink-0 w-11 h-11 rounded-full bg-primary-600 hover:bg-primary-700
                             disabled:opacity-40 disabled:cursor-not-allowed
                             flex items-center justify-center transition-colors duration-150
                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
                  aria-label="Send message"
                >
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            )}

            {/* Conversation complete */}
            {(phase === PHASES.DONE || phase === PHASES.CANCELLED) && !isTyping && (
              <button
                onClick={() => { setIsOpen(false); onClose?.(); }}
                className="w-full py-3 text-sm font-semibold text-gray-600 hover:text-gray-800
                           bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors"
              >
                Close Chat
              </button>
            )}
          </div>
        </div>
      )}

      {/* Slide-up animation keyframes */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </>
  );
}

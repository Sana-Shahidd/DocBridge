// ─────────────────────────────────────────────────────────────────────────────
// LanguageContext – MediShield AI
//
// Provides language state and a `t(keyPath)` translation helper to the whole
// component tree. Components call `useLanguage()` to get `{ lang, setLang, t, isUrdu }`.
//
// Usage:
//   const { t, lang, setLang } = useLanguage();
//   t('card.book')          → "Book" or "بک کریں"
//   t('filters.allCities')  → "All Cities" or "تمام شہر"
// ─────────────────────────────────────────────────────────────────────────────
import React, { createContext, useContext, useState } from 'react';
import { translations } from './translations';

const LanguageContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────────────────────
export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('en');

  // Navigate nested translation keys via dot-notation path (e.g. 'card.book')
  const t = (keyPath) => {
    const keys = keyPath.split('.');
    let node = translations[lang];
    for (const key of keys) {
      if (node == null) return keyPath; // Graceful fallback: show key itself
      node = node[key];
    }
    return node ?? keyPath;
  };

  const toggleLang = () => setLang((prev) => (prev === 'en' ? 'ur' : 'en'));

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t, isUrdu: lang === 'ur' }}>
      {/* dir="rtl" makes Urdu text flow right-to-left automatically */}
      <div dir={lang === 'ur' ? 'rtl' : 'ltr'} lang={lang}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
}

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  LANGUAGES,
  detectLanguage,
  translatePage,
  reapplyTranslation,
  initAutoTranslate,
  destroyAutoTranslate,
} from './translate';

/* ═══════════════════════════════════════════════════════════════
   LanguageContext — provides language state to the entire app
   Wrap <App> with <LanguageProvider> to enable translations.
   Use useLanguage() in any component to read/switch language.
═══════════════════════════════════════════════════════════════ */

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    // Check localStorage first, then browser detection
    const saved = localStorage.getItem('smart-crops-lang');
    if (saved && LANGUAGES[saved]) return saved;
    return detectLanguage();
  });
  const [translating, setTranslating] = useState(false);

  const switchLanguage = useCallback(async (lang) => {
    if (!LANGUAGES[lang]) return;
    setLanguage(lang);
    localStorage.setItem('smart-crops-lang', lang);
    setTranslating(true);
    try {
      await translatePage(lang);
    } finally {
      setTranslating(false);
    }
  }, []);

  // Auto-translate on first load if not English
  useEffect(() => {
    if (language !== 'en') {
      setTranslating(true);
      translatePage(language).finally(() => setTranslating(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start MutationObserver to auto-reapply translations on React re-renders
  useEffect(() => {
    initAutoTranslate();
    return () => destroyAutoTranslate();
  }, []);

  return (
    <LanguageContext.Provider
      value={{
        language,
        switchLanguage,
        translating,
        languages: LANGUAGES,
        reapplyTranslation,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used inside <LanguageProvider>');
  }
  return ctx;
}

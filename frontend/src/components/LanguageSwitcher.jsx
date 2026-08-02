import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../services/i18n/LanguageContext';
import { Globe, ChevronDown, Check, Loader2 } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   LanguageSwitcher — custom glass-morphism dropdown
   Matches Smart Crops dark/glass UI with smooth animations.
═══════════════════════════════════════════════════════════════ */

const FLAGS = {
  en: '🇬🇧',
  sw: '🇹🇿',
};

export default function LanguageSwitcher() {
  const { language, switchLanguage, translating, languages } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  /* Close dropdown on outside click */
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const current = languages[language];
  const flag = FLAGS[language] || '🌐';

  return (
    <div className="lang-switcher" ref={ref}>
      {/* ── Trigger button ─────────────────────────────────── */}
      <button
        className={`lang-trigger ${open ? 'open' : ''} ${translating ? 'translating' : ''}`}
        onClick={() => !translating && setOpen(!open)}
        title="Change language"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {translating ? (
          <Loader2 size={14} className="lang-spin" />
        ) : (
          <Globe size={14} className="lang-globe-icon" />
        )}
        <span className="lang-flag">{flag}</span>
        <span className="lang-code">{current?.flag || language.toUpperCase()}</span>
        <ChevronDown size={12} className={`lang-chevron ${open ? 'rotated' : ''}`} />
      </button>

      {/* ── Dropdown menu ──────────────────────────────────── */}
      {open && (
        <div className="lang-dropdown" role="listbox">
          <div className="lang-dropdown-header">
            <Globe size={11} />
            <span>Language</span>
          </div>

          {Object.entries(languages).map(([code, { label, flag: codeFlag }]) => {
            const isActive = code === language;
            const emoji = FLAGS[code] || '🌐';
            return (
              <button
                key={code}
                className={`lang-option ${isActive ? 'active' : ''}`}
                onClick={() => {
                  switchLanguage(code);
                  setOpen(false);
                }}
                role="option"
                aria-selected={isActive}
              >
                <span className="lang-option-flag">{emoji}</span>
                <div className="lang-option-text">
                  <span className="lang-option-label">{label}</span>
                  <span className="lang-option-code">{codeFlag}</span>
                </div>
                {isActive && <Check size={14} className="lang-check" />}
              </button>
            );
          })}

          {translating && (
            <div className="lang-translating-bar">
              <div className="lang-translating-progress" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Lang, i18n } from '@/i18n.ts';
import { useLangPath } from '@/lang-context.ts';
import { useTheme } from '@/theme-context.ts';

const LANG_OPTIONS: { value: Lang; label: string; flag: string }[] = [
  { value: 'ko', label: '한국어', flag: '🇰🇷' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'ja', label: '日本語', flag: '🇯🇵' },
];

interface HeaderProps {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const Header: React.FC<HeaderProps> = ({ lang, setLang }) => {
  const t = i18n[lang];
  const lp = useLangPath();
  const { theme, toggleTheme } = useTheme();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLang = LANG_OPTIONS.find(o => o.value === lang)!;

  return (
    <header className="app-header" role="banner">
      <Link to={lp('/')} className="brand">
        <img src="/logo.png" alt="Spritfy" width={700} height={250} style={{ height: 52, width: 'auto' }} />
      </Link>
      <nav className="header-nav" aria-label="Main navigation">
        <NavLink to={lp('/editor')} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} aria-label={t.navEditor}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>draw</span>
          <span className="nav-label">{t.navEditor}</span>
        </NavLink>
        <NavLink to={lp('/sprite')} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} aria-label={t.navSprite}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>movie</span>
          <span className="nav-label">{t.navSprite}</span>
        </NavLink>
        <NavLink to={lp('/converter')} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} aria-label={t.navConverter}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>swap_horiz</span>
          <span className="nav-label">{t.navConverter}</span>
        </NavLink>
      </nav>
      <div className="header-actions">
        <div className="lang-dropdown" ref={langRef}>
          <button
            className="header-action-btn"
            onClick={() => setLangOpen(!langOpen)}
            aria-expanded={langOpen}
            aria-haspopup="listbox"
            aria-label="Change language"
          >
            <span className="material-symbols-outlined" aria-hidden="true">translate</span>
            <span className="lang-current">{currentLang.label}</span>
            <span className="material-symbols-outlined lang-chevron" aria-hidden="true" style={{ fontSize: 16 }}>
              expand_more
            </span>
          </button>
          {langOpen && (
            <ul className="lang-menu" role="listbox" aria-label="Language">
              {LANG_OPTIONS.map(opt => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === lang}
                  className={`lang-menu-item${opt.value === lang ? ' active' : ''}`}
                  onClick={() => { setLang(opt.value); setLangOpen(false); }}
                >
                  <span className="lang-flag">{opt.flag}</span>
                  <span>{opt.label}</span>
                  {opt.value === lang && (
                    <span className="material-symbols-outlined lang-check" aria-hidden="true">check</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          className="header-action-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>
      </div>
    </header>
  );
};

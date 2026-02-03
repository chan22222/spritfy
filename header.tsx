import React from 'react';
import { NavLink } from 'react-router-dom';
import { Lang, i18n } from '@/i18n.ts';

interface HeaderProps {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const Header: React.FC<HeaderProps> = ({ lang, setLang }) => {
  const t = i18n[lang];

  return (
    <div className="app-header">
      <div className="brand" style={{ cursor: 'pointer' }}>
        <img src="/logo.png" alt="Spritfy" style={{ height: 32 }} />
      </div>
      <nav className="header-nav">
        <NavLink to="/sprite" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>movie</span>
          {t.navSprite}
        </NavLink>
        <NavLink to="/editor" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>draw</span>
          {t.navEditor}
        </NavLink>
      </nav>
      <button
        className="btn btn-secondary"
        onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>translate</span>
        {lang === 'ko' ? 'EN' : '한국어'}
      </button>
    </div>
  );
};

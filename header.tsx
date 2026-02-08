import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Lang, i18n } from '@/i18n.ts';

interface HeaderProps {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const Header: React.FC<HeaderProps> = ({ lang, setLang }) => {
  const t = i18n[lang];

  return (
    <div className="app-header">
      <Link to="/" className="brand">
        <img src="/logo.png" alt="Spritfy" width={700} height={250} style={{ height: 52, width: 'auto' }} />
      </Link>
      <nav className="header-nav">
        <NavLink to="/editor" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>draw</span>
          <span className="nav-label">{t.navEditor}</span>
        </NavLink>
        <NavLink to="/sprite" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>movie</span>
          <span className="nav-label">{t.navSprite}</span>
        </NavLink>
        <NavLink to="/converter" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>swap_horiz</span>
          <span className="nav-label">{t.navConverter}</span>
        </NavLink>
      </nav>
      <button
        className="btn btn-secondary lang-toggle"
        onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>translate</span>
        <span className="nav-label">{lang === 'ko' ? 'EN' : '한국어'}</span>
      </button>
    </div>
  );
};

import React from 'react';
import { Link } from 'react-router-dom';
import { Lang } from '@/i18n.ts';

interface FooterProps {
  lang: Lang;
  t: Record<string, string>;
}

export const Footer: React.FC<FooterProps> = ({ lang, t }) => {
  return (
    <footer className="site-footer">
      <div className="footer-pixel-row" aria-hidden="true" />
      <nav className="footer-nav" aria-label="Footer navigation">
        <Link to="/guide/sprite-sheet">{t.footerGuide} - Sprite</Link>
        <span className="footer-sep" aria-hidden="true">|</span>
        <Link to="/guide/pixel-art">{t.footerGuide} - Pixel Art</Link>
        <span className="footer-sep" aria-hidden="true">|</span>
        <Link to="/converter">{t.footerConverter}</Link>
        <span className="footer-sep" aria-hidden="true">|</span>
        <Link to="/about">{t.footerAbout}</Link>
        <span className="footer-sep" aria-hidden="true">|</span>
        <Link to="/privacy">{t.footerPrivacy}</Link>
        <span className="footer-sep" aria-hidden="true">|</span>
        <Link to="/terms">{t.footerTerms}</Link>
      </nav>
      <p className="footer-copyright">{t.footerText}</p>
    </footer>
  );
};

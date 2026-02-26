import React from 'react';
import { Link } from 'react-router-dom';
import { Lang } from '@/i18n.ts';
import { useLangPath } from '@/lang-context.ts';

interface FooterProps {
  lang: Lang;
  t: Record<string, string>;
}

export const Footer: React.FC<FooterProps> = ({ lang, t }) => {
  const lp = useLangPath();

  return (
    <footer className="site-footer">
      <div className="footer-pixel-row" aria-hidden="true" />
      <nav className="footer-nav" aria-label="Footer navigation">
        <Link to={lp('/blog')}>{t.footerBlog}</Link>
        <span className="footer-sep" aria-hidden="true">|</span>
        <Link to={lp('/faq')}>{t.footerFaq}</Link>
        <span className="footer-sep" aria-hidden="true">|</span>
        <Link to={lp('/about')}>{t.footerAbout}</Link>
        <span className="footer-sep" aria-hidden="true">|</span>
        <Link to={lp('/contact')}>{t.footerContact}</Link>
        <span className="footer-sep" aria-hidden="true">|</span>
        <Link to={lp('/guidelines')}>{t.footerGuidelines}</Link>
        <span className="footer-sep" aria-hidden="true">|</span>
        <Link to={lp('/privacy')}>{t.footerPrivacy}</Link>
        <span className="footer-sep" aria-hidden="true">|</span>
        <Link to={lp('/terms')}>{t.footerTerms}</Link>
      </nav>
      <p className="footer-copyright">{t.footerText}</p>
    </footer>
  );
};

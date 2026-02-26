import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Lang } from '@/i18n.ts';
import { Footer } from '@/footer.tsx';
import '@/legal.css';

interface NotFoundProps {
  lang: Lang;
  t: Record<string, string>;
}

export const NotFoundPage: React.FC<NotFoundProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="legal-page">
      <div className="legal-content" style={{ textAlign: 'center', paddingTop: 80, paddingBottom: 120 }}>
        <div style={{
          fontSize: '6rem',
          fontFamily: "'DungGeunMo', monospace",
          color: 'var(--primary)',
          lineHeight: 1,
          marginBottom: 8,
          textShadow: '4px 4px 0 rgba(187, 134, 252, 0.2)',
        }}>
          404
        </div>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 64,
          height: 64,
          background: 'rgba(187, 134, 252, 0.1)',
          border: '2px solid var(--primary)',
          marginBottom: 24,
        }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 32, color: 'var(--primary)' }}
            aria-hidden="true"
          >
            search_off
          </span>
        </div>

        <h1 style={{
          fontFamily: "'DungGeunMo', monospace",
          fontSize: '1.6rem',
          fontWeight: 'normal',
          color: 'var(--text-main)',
          margin: '0 0 12px',
          textShadow: '3px 3px 0 rgba(187, 134, 252, 0.15)',
        }}>
          {t.notFoundTitle}
        </h1>

        <p style={{
          fontSize: '0.92rem',
          color: 'var(--text-muted)',
          lineHeight: 1.8,
          margin: '0 0 32px',
          maxWidth: 420,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          {t.notFoundDesc}
        </p>

        <Link
          to={`/${lang}/`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: "'DungGeunMo', monospace",
            fontSize: '0.95rem',
            color: 'var(--bg-dark)',
            background: 'var(--primary)',
            padding: '12px 28px',
            border: 'none',
            textDecoration: 'none',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18 }}
            aria-hidden="true"
          >
            home
          </span>
          {t.notFoundBackHome}
        </Link>

      </div>
      <Footer lang={lang} t={t} />
    </div>
  );
};

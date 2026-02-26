import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Lang } from '@/i18n.ts';
import { useLangPath } from '@/lang-context.ts';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import '@/legal.css';

interface GuidelinesProps {
  lang: Lang;
  t: Record<string, string>;
}

export const GuidelinesPage: React.FC<GuidelinesProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const lp = useLangPath();

  const sections = [
    { title: t.guidelinesS1Title, content: t.guidelinesS1Content },
    { title: t.guidelinesS2Title, content: t.guidelinesS2Content },
    { title: t.guidelinesS3Title, content: t.guidelinesS3Content },
    { title: t.guidelinesS4Title, content: t.guidelinesS4Content },
    { title: t.guidelinesS5Title, content: t.guidelinesS5Content },
    { title: t.guidelinesS6Title, content: t.guidelinesS6Content },
    { title: t.guidelinesS7Title, content: t.guidelinesS7Content },
  ];

  return (
    <div className="legal-page">
      <SEO title={t.seoGuidelinesTitle} description={t.seoGuidelinesDesc} path="/guidelines" lang={lang} />
      <div className="legal-content">
        <h1>{t.guidelinesTitle}</h1>
        <p className="legal-updated">{t.guidelinesLastUpdated}</p>
        <p className="legal-intro">{t.guidelinesIntro}</p>
        {sections.map((s, i) => (
          <section key={i} className="legal-section">
            <h2>{s.title}</h2>
            <p>{s.content}</p>
          </section>
        ))}
        <div className="guide-bottom-cta">
          <p>{t.guidelinesCtaText}</p>
          <Link to={lp('/gallery')} className="guide-cta-button">{t.guidelinesCtaButton}</Link>
        </div>
      </div>
      <Footer lang={lang} t={t} />
    </div>
  );
};

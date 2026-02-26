import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Lang } from '@/i18n.ts';
import { useLangPath } from '@/lang-context.ts';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import '@/legal.css';

interface GuideSpriteProps {
  lang: Lang;
  t: Record<string, string>;
}

export const GuideSpriteSheetPage: React.FC<GuideSpriteProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const lp = useLangPath();

  const sections = [
    { title: t.guideSpriteS1Title, content: t.guideSpriteS1Content },
    { title: t.guideSpriteS2Title, content: t.guideSpriteS2Content },
    { title: t.guideSpriteS3Title, content: t.guideSpriteS3Content },
    { title: t.guideSpriteS4Title, content: t.guideSpriteS4Content },
    { title: t.guideSpriteS5Title, content: t.guideSpriteS5Content },
    { title: t.guideSpriteS6Title, content: t.guideSpriteS6Content },
    { title: t.guideSpriteS7Title, content: t.guideSpriteS7Content },
    { title: t.guideSpriteS8Title, content: t.guideSpriteS8Content },
    { title: t.guideSpriteS9Title, content: t.guideSpriteS9Content },
    { title: t.guideSpriteS10Title, content: t.guideSpriteS10Content },
  ];

  return (
    <div className="legal-page">
      <SEO title={t.seoGuideSpriteTitle} description={t.seoGuideSpriteDesc} path="/guide/sprite-sheet" lang={lang} />
      <div className="legal-content guide-content">
        <h1>{t.guideSpriteTitle}</h1>
        <p className="legal-intro">{t.guideSpriteIntro}</p>

        <div className="guide-cta-box">
          <Link to={lp('/sprite')} className="guide-cta-link">
            <span className="material-symbols-outlined">movie</span>
            {t.guideSpriteCtaTop}
          </Link>
        </div>

        {sections.map((s, i) => (
          <section key={i} className="legal-section">
            <h2>{s.title}</h2>
            <p>{s.content}</p>
          </section>
        ))}

        <div className="guide-bottom-cta">
          <p>{t.guideSpriteCtaBottom}</p>
          <Link to={lp('/sprite')} className="guide-cta-button">
            {t.guideSpriteCtaButton}
          </Link>
        </div>
      </div>
      <Footer lang={lang} t={t} />
    </div>
  );
};

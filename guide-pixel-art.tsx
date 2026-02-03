import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Lang } from '@/i18n.ts';
import { Footer } from '@/footer.tsx';

interface GuidePixelProps {
  lang: Lang;
  t: Record<string, string>;
}

export const GuidePixelArtPage: React.FC<GuidePixelProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const sections = [
    { title: t.guidePixelS1Title, content: t.guidePixelS1Content },
    { title: t.guidePixelS2Title, content: t.guidePixelS2Content },
    { title: t.guidePixelS3Title, content: t.guidePixelS3Content },
    { title: t.guidePixelS4Title, content: t.guidePixelS4Content },
    { title: t.guidePixelS5Title, content: t.guidePixelS5Content },
  ];

  return (
    <div className="legal-page">
      <div className="legal-content guide-content">
        <h1>{t.guidePixelTitle}</h1>
        <p className="legal-intro">{t.guidePixelIntro}</p>

        <div className="guide-cta-box">
          <Link to="/editor" className="guide-cta-link">
            <span className="material-symbols-outlined">draw</span>
            {t.guidePixelCtaTop}
          </Link>
        </div>

        {sections.map((s, i) => (
          <section key={i} className="legal-section">
            <h2>{s.title}</h2>
            <p>{s.content}</p>
          </section>
        ))}

        <div className="guide-bottom-cta">
          <p>{t.guidePixelCtaBottom}</p>
          <Link to="/editor" className="guide-cta-button">
            {t.guidePixelCtaButton}
          </Link>
        </div>
      </div>
      <Footer lang={lang} t={t} />
    </div>
  );
};

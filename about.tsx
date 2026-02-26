import React, { useEffect } from 'react';
import SEO from '@/seo.tsx';
import { Lang } from '@/i18n.ts';
import { Footer } from '@/footer.tsx';
import '@/legal.css';

interface AboutProps {
  lang: Lang;
  t: Record<string, string>;
}

export const AboutPage: React.FC<AboutProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const features = [
    { icon: 'draw', title: t.aboutFeature1Title, desc: t.aboutFeature1Desc },
    { icon: 'movie', title: t.aboutFeature2Title, desc: t.aboutFeature2Desc },
    { icon: 'file_download', title: t.aboutFeature3Title, desc: t.aboutFeature3Desc },
    { icon: 'toll', title: t.aboutFeature4Title, desc: t.aboutFeature4Desc },
  ];

  return (
    <div className="legal-page">
      <SEO title={t.seoAboutTitle} description={t.seoAboutDesc} path="/about" lang={lang} />
      <div className="legal-content">
        <h1>{t.aboutTitle}</h1>

        <div className="about-intro-section">
          <p>{t.aboutIntro}</p>
          <p>{t.aboutMission}</p>
        </div>

        <section className="legal-section">
          <h2>{t.aboutStoryTitle}</h2>
          <p>{t.aboutStoryContent}</p>
        </section>

        <section className="legal-section">
          <h2>{t.aboutVisionTitle}</h2>
          <p>{t.aboutVisionContent}</p>
        </section>

        <h2 className="about-features-title">{t.aboutFeatureTitle}</h2>
        <div className="about-feature-grid">
          {features.map((f, i) => (
            <div key={i} className="about-feature-card">
              <div className="feature-icon">
                <span className="material-symbols-outlined">{f.icon}</span>
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>

        <section className="legal-section">
          <h2>{t.aboutTechTitle}</h2>
          <p>{t.aboutTechContent}</p>
        </section>

        <div className="about-contact-card">
          <h2>{t.aboutOperatorTitle}</h2>
          <div className="about-contact-info">
            <p>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>group</span>
              {t.aboutOperator}
            </p>
            <p>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>mail</span>
              <a href="mailto:hckwon@kakao.com">{t.aboutContact}</a>
            </p>
          </div>
        </div>
      </div>
      <Footer lang={lang} t={t} />
    </div>
  );
};

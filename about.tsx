import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Lang } from '@/i18n.ts';
import { Footer } from '@/footer.tsx';

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
      <Helmet>
        <title>소개 - 스프릿파이 | Spritfy</title>
        <meta name="description" content="스프릿파이(Spritfy) 소개 페이지. 무료 온라인 픽셀 아트 에디터 및 스프라이트 시트 생성기." />
        <link rel="canonical" href="https://spritfy.xyz/about" />
        <meta property="og:title" content="소개 - 스프릿파이 | Spritfy" />
        <meta property="og:description" content="스프릿파이(Spritfy) 소개 페이지. 무료 온라인 픽셀 아트 에디터 및 스프라이트 시트 생성기." />
        <meta property="og:url" content="https://spritfy.xyz/about" />
      </Helmet>
      <div className="legal-content">
        <h1>{t.aboutTitle}</h1>

        <div className="about-intro-section">
          <p>{t.aboutIntro}</p>
          <p>{t.aboutMission}</p>
        </div>

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

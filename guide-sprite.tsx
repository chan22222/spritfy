import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Lang } from '@/i18n.ts';
import { Footer } from '@/footer.tsx';

interface GuideSpriteProps {
  lang: Lang;
  t: Record<string, string>;
}

export const GuideSpriteSheetPage: React.FC<GuideSpriteProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const sections = [
    { title: t.guideSpriteS1Title, content: t.guideSpriteS1Content },
    { title: t.guideSpriteS2Title, content: t.guideSpriteS2Content },
    { title: t.guideSpriteS3Title, content: t.guideSpriteS3Content },
    { title: t.guideSpriteS4Title, content: t.guideSpriteS4Content },
    { title: t.guideSpriteS5Title, content: t.guideSpriteS5Content },
  ];

  return (
    <div className="legal-page">
      <Helmet>
        <title>스프라이트 시트 가이드 - 스프릿파이 | 스프라이트 시트 만드는 법</title>
        <meta name="description" content="스프라이트 시트란 무엇인지, 어떻게 만드는지 알아보세요. 게임 개발과 애니메이션을 위한 스프라이트 시트 제작 가이드." />
        <link rel="canonical" href="https://spritfy.xyz/guide/sprite-sheet" />
        <meta property="og:title" content="스프라이트 시트 가이드 - 스프릿파이 | 스프라이트 시트 만드는 법" />
        <meta property="og:description" content="스프라이트 시트란 무엇인지, 어떻게 만드는지 알아보세요. 게임 개발과 애니메이션을 위한 스프라이트 시트 제작 가이드." />
        <meta property="og:url" content="https://spritfy.xyz/guide/sprite-sheet" />
      </Helmet>
      <div className="legal-content guide-content">
        <h1>{t.guideSpriteTitle}</h1>
        <p className="legal-intro">{t.guideSpriteIntro}</p>

        <div className="guide-cta-box">
          <Link to="/sprite" className="guide-cta-link">
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
          <Link to="/sprite" className="guide-cta-button">
            {t.guideSpriteCtaButton}
          </Link>
        </div>
      </div>
      <Footer lang={lang} t={t} />
    </div>
  );
};

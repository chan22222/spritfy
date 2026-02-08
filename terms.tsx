import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Lang } from '@/i18n.ts';
import { Footer } from '@/footer.tsx';

interface TermsProps {
  lang: Lang;
  t: Record<string, string>;
}

export const TermsPage: React.FC<TermsProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const sections = [
    { title: t.termsS1Title, content: t.termsS1Content },
    { title: t.termsS2Title, content: t.termsS2Content },
    { title: t.termsS3Title, content: t.termsS3Content },
    { title: t.termsS4Title, content: t.termsS4Content },
    { title: t.termsS5Title, content: t.termsS5Content },
    { title: t.termsS6Title, content: t.termsS6Content },
    { title: t.termsS7Title, content: t.termsS7Content },
    { title: t.termsS8Title, content: t.termsS8Content },
    { title: t.termsS9Title, content: t.termsS9Content },
  ];

  return (
    <div className="legal-page">
      <Helmet>
        <title>이용약관 - 스프릿파이 | Spritfy</title>
        <meta name="description" content="스프릿파이(Spritfy) 서비스 이용약관." />
        <link rel="canonical" href="https://spritfy.xyz/terms" />
        <meta property="og:title" content="이용약관 - 스프릿파이 | Spritfy" />
        <meta property="og:description" content="스프릿파이(Spritfy) 서비스 이용약관." />
        <meta property="og:url" content="https://spritfy.xyz/terms" />
      </Helmet>
      <div className="legal-content">
        <h1>{t.termsTitle}</h1>
        <p className="legal-updated">{t.termsLastUpdated}</p>
        <p className="legal-intro">{t.termsIntro}</p>
        {sections.map((s, i) => (
          <section key={i} className="legal-section">
            <h2>{s.title}</h2>
            <p>{s.content}</p>
          </section>
        ))}
      </div>
      <Footer lang={lang} t={t} />
    </div>
  );
};

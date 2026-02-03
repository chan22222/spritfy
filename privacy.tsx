import React, { useEffect } from 'react';
import { Lang } from '@/i18n.ts';
import { Footer } from '@/footer.tsx';
import SEO from '@/seo.tsx';

interface PrivacyProps {
  lang: Lang;
  t: Record<string, string>;
}

export const PrivacyPage: React.FC<PrivacyProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const sections = [
    { title: t.privacyS1Title, content: t.privacyS1Content },
    { title: t.privacyS2Title, content: t.privacyS2Content },
    { title: t.privacyS3Title, content: t.privacyS3Content },
    { title: t.privacyS4Title, content: t.privacyS4Content },
    { title: t.privacyS5Title, content: t.privacyS5Content },
    { title: t.privacyS6Title, content: t.privacyS6Content },
    { title: t.privacyS7Title, content: t.privacyS7Content },
    { title: t.privacyS8Title, content: t.privacyS8Content },
    { title: t.privacyS9Title, content: t.privacyS9Content },
  ];

  return (
    <div className="legal-page">
      <SEO title={t.seoPrivacyTitle} canonicalPath="/privacy" noIndex />
      <div className="legal-content">
        <h1>{t.privacyTitle}</h1>
        <p className="legal-updated">{t.privacyLastUpdated}</p>
        <p className="legal-intro">{t.privacyIntro}</p>
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

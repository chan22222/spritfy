import React, { useEffect } from 'react';
import { Lang } from '@/i18n.ts';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import '@/legal.css';

interface ContactProps {
  lang: Lang;
  t: Record<string, string>;
}

export const ContactPage: React.FC<ContactProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="legal-page">
      <SEO title={t.seoContactTitle} description={t.seoContactDesc} path="/contact" lang={lang} />
      <div className="legal-content">
        <h1>{t.contactTitle}</h1>
        <p className="legal-intro">{t.contactIntro}</p>

        <section className="legal-section">
          <h2>{t.contactEmailTitle}</h2>
          <p>{t.contactEmailContent}</p>
          <div className="about-contact-card" style={{ marginTop: 16 }}>
            <div className="about-contact-info">
              <p>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>mail</span>
                <a href="mailto:hckwon@kakao.com">hckwon@kakao.com</a>
              </p>
            </div>
          </div>
        </section>

        <section className="legal-section">
          <h2>{t.contactResponseTitle}</h2>
          <p>{t.contactResponseContent}</p>
        </section>

        <section className="legal-section">
          <h2>{t.contactBugTitle}</h2>
          <p>{t.contactBugContent}</p>
        </section>

        <section className="legal-section">
          <h2>{t.contactBusinessTitle}</h2>
          <p>{t.contactBusinessContent}</p>
        </section>

        <section className="legal-section">
          <h2>{t.contactFeedbackTitle}</h2>
          <p>{t.contactFeedbackContent}</p>
        </section>
      </div>
      <Footer lang={lang} t={t} />
    </div>
  );
};

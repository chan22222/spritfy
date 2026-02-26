import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lang } from '@/i18n.ts';
import { useLangPath } from '@/lang-context.ts';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import '@/legal.css';

interface FaqProps {
  lang: Lang;
  t: Record<string, string>;
}

export const FaqPage: React.FC<FaqProps> = ({ lang, t }) => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const lp = useLangPath();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    { q: t.faqQ1, a: t.faqA1 },
    { q: t.faqQ2, a: t.faqA2 },
    { q: t.faqQ3, a: t.faqA3 },
    { q: t.faqQ4, a: t.faqA4 },
    { q: t.faqQ5, a: t.faqA5 },
    { q: t.faqQ6, a: t.faqA6 },
    { q: t.faqQ7, a: t.faqA7 },
    { q: t.faqQ8, a: t.faqA8 },
    { q: t.faqQ9, a: t.faqA9 },
    { q: t.faqQ10, a: t.faqA10 },
    { q: t.faqQ11, a: t.faqA11 },
    { q: t.faqQ12, a: t.faqA12 },
    { q: t.faqQ13, a: t.faqA13 },
    { q: t.faqQ14, a: t.faqA14 },
    { q: t.faqQ15, a: t.faqA15 },
    { q: t.faqQ16, a: t.faqA16 },
    { q: t.faqQ17, a: t.faqA17 },
    { q: t.faqQ18, a: t.faqA18 },
    { q: t.faqQ19, a: t.faqA19 },
    { q: t.faqQ20, a: t.faqA20 },
    { q: t.faqQ21, a: t.faqA21 },
    { q: t.faqQ22, a: t.faqA22 },
  ];

  return (
    <div className="legal-page">
      <SEO title={t.seoFaqTitle} description={t.seoFaqDesc} path="/faq" lang={lang} />
      <div className="legal-content">
        <h1>{t.faqTitle}</h1>
        <p className="legal-intro">{t.faqIntro}</p>

        {faqs.map((faq, i) => (
          <div key={i} className="faq-item" onClick={() => setOpenIndex(openIndex === i ? null : i)}>
            <button className="faq-question" aria-expanded={openIndex === i}>
              <span>{faq.q}</span>
              <span className="material-symbols-outlined faq-chevron" style={{ transform: openIndex === i ? 'rotate(180deg)' : 'none' }}>
                expand_more
              </span>
            </button>
            {openIndex === i && (
              <div className="faq-answer">
                <p>{faq.a}</p>
              </div>
            )}
          </div>
        ))}

        <div className="guide-bottom-cta">
          <p>{t.faqCtaText}</p>
          <Link to={lp('/contact')} className="guide-cta-button">
            {t.faqCtaButton}
          </Link>
        </div>
      </div>
      <Footer lang={lang} t={t} />
    </div>
  );
};

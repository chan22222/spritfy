import React from 'react';
import { Link } from 'react-router-dom';
import { Lang, i18n } from '@/i18n.ts';
import { useLangPath } from '@/lang-context.ts';
import SEO from '@/seo.tsx';
import { Footer } from '@/footer.tsx';
import { CommunityShowcase } from '@/gallery/community-showcase.tsx';
import '@/landing.css';
import '@/legal.css';

interface LandingProps {
  lang: Lang;
  t: Record<string, string>;
}

export const LandingPage: React.FC<LandingProps> = ({ lang, t }) => {
  const lp = useLangPath();

  return (
    <div className="landing-page">
      <SEO title={t.seoLandingTitle} description={t.seoLandingDesc} path="/" lang={lang} />
      {/* Pixel grid background overlay */}
      <div className="pixel-grid-bg" aria-hidden="true" />

      {/* Floating pixel decorations */}
      <div className="pixel-stars" aria-hidden="true">
        <div className="pixel-star star-1" />
        <div className="pixel-star star-2" />
        <div className="pixel-star star-3" />
        <div className="pixel-star star-4" />
        <div className="pixel-star star-5" />
      </div>

      {/* Hero */}
      <section className="landing-hero">
        <div className="hero-badge">PIXEL ART TOOL</div>
        <img src="/logo.png" alt="Spritfy" width={700} height={250} className="landing-hero-logo" fetchPriority="high" />
        <h1 className="landing-hero-title">{t.heroTitle}</h1>
        <p className="landing-hero-subtitle">
          {t.heroSubtitle.split('\n').map((line, i, arr) => (
            <React.Fragment key={i}>
              {line}
              {i < arr.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
        <p className="landing-hero-desc">
          {t.heroDescription.split('\n').map((line, i, arr) => (
            <React.Fragment key={i}>
              {line}
              {i < arr.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>

        <div className="landing-hero-cta">
          <Link to={lp('/editor')} className="pixel-btn pixel-btn-primary">
            <span className="material-symbols-outlined">draw</span>
            {t.ctaEditor}
          </Link>
          <Link to={lp('/sprite')} className="pixel-btn pixel-btn-ghost">
            <span className="material-symbols-outlined">movie</span>
            {t.ctaSprite}
          </Link>
        </div>

        {/* Animated character */}
        <img src="/spritfy_character.png" alt="" className="pixel-character" aria-hidden="true" />
      </section>

      {/* Divider */}
      <div className="pixel-divider" aria-hidden="true">
        <div className="pixel-divider-line" />
        <div className="pixel-divider-diamond" />
        <div className="pixel-divider-line" />
      </div>

      {/* Community Showcase */}
      <CommunityShowcase lang={lang} t={t} />

      {/* Pixel Divider */}
      <div className="pixel-divider" aria-hidden="true">
        <div className="pixel-divider-line" />
        <div className="pixel-divider-diamond" />
        <div className="pixel-divider-line" />
      </div>

      {/* Feature Cards */}
      <section className="landing-features">
        <div className="landing-feature-card pixel-border">
          <div className="feature-card-corner tl" /><div className="feature-card-corner tr" />
          <div className="feature-card-corner bl" /><div className="feature-card-corner br" />
          <div className="landing-feature-icon">
            <span className="material-symbols-outlined">draw</span>
          </div>
          <h2>{t.featureEditorTitle}</h2>
          <p>{t.featureEditorBullet1} / {t.featureEditorBullet2} / {t.featureEditorBullet3}</p>
          <Link to={lp('/editor')} className="feature-cta-link">
            {t.ctaEditor}
            <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        </div>

        <div className="landing-feature-card pixel-border card-secondary">
          <div className="feature-card-corner tl" /><div className="feature-card-corner tr" />
          <div className="feature-card-corner bl" /><div className="feature-card-corner br" />
          <div className="landing-feature-icon icon-secondary">
            <span className="material-symbols-outlined">movie</span>
          </div>
          <h2>{t.featureSpriteTitle}</h2>
          <p>{t.featureSpriteBullet1} / {t.featureSpriteBullet2} / {t.featureSpriteBullet3}</p>
          <Link to={lp('/sprite')} className="feature-cta-link link-secondary">
            {t.ctaSprite}
            <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        </div>

        <div className="landing-feature-card pixel-border card-tertiary">
          <div className="feature-card-corner tl" /><div className="feature-card-corner tr" />
          <div className="feature-card-corner bl" /><div className="feature-card-corner br" />
          <div className="landing-feature-icon icon-tertiary">
            <span className="material-symbols-outlined">swap_horiz</span>
          </div>
          <h2>{t.featureConverterTitle}</h2>
          <p>{t.featureConverterBullet1} / {t.featureConverterBullet2} / {t.featureConverterBullet3}</p>
          <Link to={lp('/converter')} className="feature-cta-link link-tertiary">
            {t.ctaConverter}
            <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        </div>
      </section>

      {/* Pixel Divider */}
      <div className="pixel-divider" aria-hidden="true">
        <div className="pixel-divider-line" />
        <div className="pixel-divider-diamond" />
        <div className="pixel-divider-line" />
      </div>

      {/* Highlights */}
      <section className="landing-highlights">
        <h2 className="landing-highlights-title">{t.featureHighlightsTitle}</h2>
        <div className="landing-highlights-grid">
          <div className="landing-highlight-item">
            <div className="highlight-pixel-icon">
              <span className="material-symbols-outlined">toll</span>
            </div>
            <h3>{t.highlightFree}</h3>
            <p>{t.highlightFreeDesc}</p>
          </div>
          <div className="landing-highlight-item">
            <div className="highlight-pixel-icon">
              <span className="material-symbols-outlined">language</span>
            </div>
            <h3>{t.highlightBrowser}</h3>
            <p>{t.highlightBrowserDesc}</p>
          </div>
          <div className="landing-highlight-item">
            <div className="highlight-pixel-icon">
              <span className="material-symbols-outlined">translate</span>
            </div>
            <h3>{t.highlightKorean}</h3>
            <p>{t.highlightKoreanDesc}</p>
          </div>
          <div className="landing-highlight-item">
            <div className="highlight-pixel-icon">
              <span className="material-symbols-outlined">file_download</span>
            </div>
            <h3>{t.highlightExport}</h3>
            <p>{t.highlightExportDesc}</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer lang={lang} t={t} />
    </div>
  );
};

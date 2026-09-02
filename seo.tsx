import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Lang } from '@/i18n.ts';

/** head 태그를 직접 갱신한다 — Helmet이 반영을 놓치는 경우(클라이언트 라우팅, keep-alive 전환)의 안전망 */
const setMeta = (selector: string, attr: string, value: string, create: () => HTMLElement): void => {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) { el = create(); document.head.appendChild(el); }
  el.setAttribute(attr, value);
};

interface SEOProps {
  title: string;
  description: string;
  path: string;
  lang: Lang;
}

const BASE_URL = 'https://spritfy.xyz';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;

const SEO: React.FC<SEOProps> = ({ title, description, path, lang }) => {
  const langPath = path === '/' ? '/' : path;
  const canonicalUrl = `${BASE_URL}/${lang}${langPath}`;
  const alternateLang = lang === 'ko' ? 'en' : 'ko';
  const alternateUrl = `${BASE_URL}/${alternateLang}${langPath}`;
  const ogLocale = lang === 'ko' ? 'ko_KR' : 'en_US';
  const altOgLocale = lang === 'ko' ? 'en_US' : 'ko_KR';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = title;
    const meta = (name: string, isProp = false): HTMLElement => { const m = document.createElement('meta'); m.setAttribute(isProp ? 'property' : 'name', name); return m; };
    setMeta('meta[name="description"]', 'content', description, () => meta('description'));
    setMeta('meta[property="og:title"]', 'content', title, () => meta('og:title', true));
    setMeta('meta[property="og:description"]', 'content', description, () => meta('og:description', true));
    setMeta('meta[property="og:url"]', 'content', canonicalUrl, () => meta('og:url', true));
    setMeta('meta[name="twitter:title"]', 'content', title, () => meta('twitter:title'));
    setMeta('meta[name="twitter:description"]', 'content', description, () => meta('twitter:description'));
    setMeta('link[rel="canonical"]', 'href', canonicalUrl, () => { const l = document.createElement('link'); l.setAttribute('rel', 'canonical'); return l; });
  }, [title, description, canonicalUrl]);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      <link rel="alternate" hrefLang={lang} href={canonicalUrl} />
      <link rel="alternate" hrefLang={alternateLang} href={alternateUrl} />
      <link rel="alternate" hrefLang="x-default" href={`${BASE_URL}/en${langPath}`} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={DEFAULT_IMAGE} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Spritfy" />
      <meta property="og:locale" content={ogLocale} />
      <meta property="og:locale:alternate" content={altOgLocale} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={DEFAULT_IMAGE} />
    </Helmet>
  );
};

export default SEO;

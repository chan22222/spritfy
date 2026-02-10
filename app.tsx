import React, { useCallback, useEffect, Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Lang, i18n } from '@/i18n.ts';
import { Header } from '@/header.tsx';
import { LandingPage } from '@/landing.tsx';
import { LangContext } from '@/lang-context.ts';

const PixelEditor = lazy(() => import('@/editor.tsx').then(m => ({ default: m.PixelEditor })));
const SpritePage = lazy(() => import('@/sprite-page.tsx').then(m => ({ default: m.SpritePage })));
const ConverterPage = lazy(() => import('@/converter.tsx').then(m => ({ default: m.ConverterPage })));
const PrivacyPage = lazy(() => import('@/privacy.tsx').then(m => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('@/terms.tsx').then(m => ({ default: m.TermsPage })));
const AboutPage = lazy(() => import('@/about.tsx').then(m => ({ default: m.AboutPage })));
const GuideSpriteSheetPage = lazy(() => import('@/guide-sprite.tsx').then(m => ({ default: m.GuideSpriteSheetPage })));
const GuidePixelArtPage = lazy(() => import('@/guide-pixel-art.tsx').then(m => ({ default: m.GuidePixelArtPage })));

const detectLang = (): Lang => {
  const nav = navigator.language || (navigator as unknown as Record<string, string>).userLanguage || '';
  return nav.startsWith('ko') ? 'ko' : 'en';
};

const LangRedirect = () => {
  const lang = detectLang();
  return <Navigate to={`/${lang}/`} replace />;
};

const LangLayout = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const validLang: Lang = urlLang === 'ko' || urlLang === 'en' ? urlLang : 'ko';
  const t = i18n[validLang];

  const setLang = useCallback((newLang: Lang) => {
    const pathWithoutLang = location.pathname.replace(/^\/(ko|en)/, '');
    navigate(`/${newLang}${pathWithoutLang || '/'}`, { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    document.documentElement.lang = validLang;
  }, [validLang]);

  if (urlLang !== 'ko' && urlLang !== 'en') {
    return <Navigate to={`/${detectLang()}/`} replace />;
  }

  return (
    <LangContext.Provider value={{ lang: validLang, t, setLang }}>
      <Header lang={validLang} setLang={setLang} />
      <main>
        <Outlet />
      </main>
    </LangContext.Provider>
  );
};

const LazyWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={null}>{children}</Suspense>
);

const SpriteWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = urlLang === 'ko' ? 'ko' : 'en';
  const t = i18n[validLang];
  return <LazyWrapper><SpritePage lang={validLang} t={t} /></LazyWrapper>;
};

const EditorWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = urlLang === 'ko' ? 'ko' : 'en';
  const t = i18n[validLang];
  return <LazyWrapper><PixelEditor lang={validLang} t={t} /></LazyWrapper>;
};

const LandingWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = urlLang === 'ko' ? 'ko' : 'en';
  const t = i18n[validLang];
  return <LandingPage lang={validLang} t={t} />;
};

const PrivacyWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = urlLang === 'ko' ? 'ko' : 'en';
  const t = i18n[validLang];
  return <LazyWrapper><PrivacyPage lang={validLang} t={t} /></LazyWrapper>;
};

const TermsWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = urlLang === 'ko' ? 'ko' : 'en';
  const t = i18n[validLang];
  return <LazyWrapper><TermsPage lang={validLang} t={t} /></LazyWrapper>;
};

const AboutWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = urlLang === 'ko' ? 'ko' : 'en';
  const t = i18n[validLang];
  return <LazyWrapper><AboutPage lang={validLang} t={t} /></LazyWrapper>;
};

const GuideSpriteWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = urlLang === 'ko' ? 'ko' : 'en';
  const t = i18n[validLang];
  return <LazyWrapper><GuideSpriteSheetPage lang={validLang} t={t} /></LazyWrapper>;
};

const GuidePixelArtWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = urlLang === 'ko' ? 'ko' : 'en';
  const t = i18n[validLang];
  return <LazyWrapper><GuidePixelArtPage lang={validLang} t={t} /></LazyWrapper>;
};

const ConverterWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = urlLang === 'ko' ? 'ko' : 'en';
  const t = i18n[validLang];
  return <LazyWrapper><ConverterPage lang={validLang} t={t} /></LazyWrapper>;
};

const router = createBrowserRouter([
  { index: true, element: <LangRedirect /> },
  {
    path: '/:lang',
    element: <LangLayout />,
    children: [
      { index: true, element: <LandingWrapper /> },
      { path: 'sprite', element: <SpriteWrapper /> },
      { path: 'editor', element: <EditorWrapper /> },
      { path: 'converter', element: <ConverterWrapper /> },
      { path: 'privacy', element: <PrivacyWrapper /> },
      { path: 'terms', element: <TermsWrapper /> },
      { path: 'about', element: <AboutWrapper /> },
      { path: 'guide/sprite-sheet', element: <GuideSpriteWrapper /> },
      { path: 'guide/pixel-art', element: <GuidePixelArtWrapper /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export const App = () => {
  return <RouterProvider router={router} />;
};

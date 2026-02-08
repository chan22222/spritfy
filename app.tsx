import React, { useState, useContext, Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
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

const RootLayout = () => {
  const { lang, setLang } = useContext(LangContext);
  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <main>
        <Outlet />
      </main>
    </>
  );
};

const LazyWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={null}>{children}</Suspense>
);

const SpriteWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <LazyWrapper><SpritePage lang={lang} t={t} /></LazyWrapper>;
};

const EditorWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <LazyWrapper><PixelEditor lang={lang} t={t} /></LazyWrapper>;
};

const LandingWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <LandingPage lang={lang} t={t} />;
};

const PrivacyWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <LazyWrapper><PrivacyPage lang={lang} t={t} /></LazyWrapper>;
};

const TermsWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <LazyWrapper><TermsPage lang={lang} t={t} /></LazyWrapper>;
};

const AboutWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <LazyWrapper><AboutPage lang={lang} t={t} /></LazyWrapper>;
};

const GuideSpriteWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <LazyWrapper><GuideSpriteSheetPage lang={lang} t={t} /></LazyWrapper>;
};

const GuidePixelArtWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <LazyWrapper><GuidePixelArtPage lang={lang} t={t} /></LazyWrapper>;
};

const ConverterWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <LazyWrapper><ConverterPage lang={lang} t={t} /></LazyWrapper>;
};

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <LandingWrapper /> },
      { path: '/sprite', element: <SpriteWrapper /> },
      { path: '/editor', element: <EditorWrapper /> },
      { path: '/converter', element: <ConverterWrapper /> },
      { path: '/privacy', element: <PrivacyWrapper /> },
      { path: '/terms', element: <TermsWrapper /> },
      { path: '/about', element: <AboutWrapper /> },
      { path: '/guide/sprite-sheet', element: <GuideSpriteWrapper /> },
      { path: '/guide/pixel-art', element: <GuidePixelArtWrapper /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

const detectLang = (): Lang => {
  const nav = navigator.language || (navigator as unknown as Record<string, string>).userLanguage || '';
  return nav.startsWith('ko') ? 'ko' : 'en';
};

export const App = () => {
  const [lang, setLang] = useState<Lang>(detectLang);
  const t = i18n[lang];

  return (
    <LangContext.Provider value={{ lang, t, setLang }}>
      <RouterProvider router={router} />
    </LangContext.Provider>
  );
};

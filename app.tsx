import React, { useState, useContext } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { Lang, i18n } from '@/i18n.ts';
import { Header } from '@/header.tsx';
import { PixelEditor } from '@/editor.tsx';
import { LandingPage } from '@/landing.tsx';
import { PrivacyPage } from '@/privacy.tsx';
import { TermsPage } from '@/terms.tsx';
import { AboutPage } from '@/about.tsx';
import { GuideSpriteSheetPage } from '@/guide-sprite.tsx';
import { GuidePixelArtPage } from '@/guide-pixel-art.tsx';
import { LangContext } from '@/lang-context.ts';
import { SpritePage } from '@/sprite-page.tsx';
import { ConverterPage } from '@/converter.tsx';

const RootLayout = () => {
  const { lang, setLang } = useContext(LangContext);
  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <Outlet />
    </>
  );
};

const SpriteWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <SpritePage lang={lang} t={t} />;
};

const EditorWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <PixelEditor lang={lang} t={t} />;
};

const LandingWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <LandingPage lang={lang} t={t} />;
};

const PrivacyWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <PrivacyPage lang={lang} t={t} />;
};

const TermsWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <TermsPage lang={lang} t={t} />;
};

const AboutWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <AboutPage lang={lang} t={t} />;
};

const GuideSpriteWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <GuideSpriteSheetPage lang={lang} t={t} />;
};

const GuidePixelArtWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <GuidePixelArtPage lang={lang} t={t} />;
};

const ConverterWrapper = () => {
  const { lang, t } = useContext(LangContext);
  return <ConverterPage lang={lang} t={t} />;
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

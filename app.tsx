import React, { useState, useCallback, useEffect, Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Lang, i18n } from '@/i18n.ts';
import { Header } from '@/header.tsx';
import { LandingPage } from '@/landing.tsx';
import { LangContext } from '@/lang-context.ts';
import { ThemeContext, Theme } from '@/theme-context.ts';
import { LoadingSpinner } from '@/loading.tsx';
import { NotFoundPage } from '@/not-found.tsx';
import { ErrorBoundary } from '@/error-boundary.tsx';
import { AuthProvider } from '@/auth/auth-context.tsx';
import { AuthModal } from '@/auth/auth-modal.tsx';

const PixelEditor = lazy(() => import('@/editor.tsx').then(m => ({ default: m.PixelEditor })));
const SpritePage = lazy(() => import('@/sprite-page.tsx').then(m => ({ default: m.SpritePage })));
const ConverterPage = lazy(() => import('@/converter.tsx').then(m => ({ default: m.ConverterPage })));
const PrivacyPage = lazy(() => import('@/privacy.tsx').then(m => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('@/terms.tsx').then(m => ({ default: m.TermsPage })));
const AboutPage = lazy(() => import('@/about.tsx').then(m => ({ default: m.AboutPage })));
const GuideSpriteSheetPage = lazy(() => import('@/guide-sprite.tsx').then(m => ({ default: m.GuideSpriteSheetPage })));
const GuidePixelArtPage = lazy(() => import('@/guide-pixel-art.tsx').then(m => ({ default: m.GuidePixelArtPage })));
const GalleryPage = lazy(() => import('@/gallery/gallery-page.tsx').then(m => ({ default: m.GalleryPage })));
const PostDetailPage = lazy(() => import('@/gallery/post-detail.tsx').then(m => ({ default: m.PostDetailPage })));
const FaqPage = lazy(() => import('@/faq.tsx').then(m => ({ default: m.FaqPage })));
const ContactPage = lazy(() => import('@/contact.tsx').then(m => ({ default: m.ContactPage })));
const GuidelinesPage = lazy(() => import('@/guidelines.tsx').then(m => ({ default: m.GuidelinesPage })));
const BlogListPage = lazy(() => import('@/blog-list.tsx').then(m => ({ default: m.BlogListPage })));
const BlogPostPage = lazy(() => import('@/blog-post.tsx').then(m => ({ default: m.BlogPostPage })));
const BoardPage = lazy(() => import('@/board/board-page.tsx').then(m => ({ default: m.BoardPage })));
const BoardDetailPage = lazy(() => import('@/board/board-detail.tsx').then(m => ({ default: m.BoardDetailPage })));
const SoundPage = lazy(() => import('@/sounds/sound-page.tsx').then(m => ({ default: m.SoundPage })));
const SoundDetailPage = lazy(() => import('@/sounds/sound-detail.tsx').then(m => ({ default: m.SoundDetailPage })));

const detectLang = (): Lang => {
  const nav = navigator.language || (navigator as unknown as Record<string, string>).userLanguage || '';
  return nav.startsWith('ko') ? 'ko' : nav.startsWith('ja') ? 'ja' : 'en';
};

const VALID_LANGS: readonly Lang[] = ['ko', 'en', 'ja'];
const toValidLang = (urlLang: string | undefined): Lang =>
  VALID_LANGS.includes(urlLang as Lang) ? (urlLang as Lang) : 'ko';

const LangRedirect = () => {
  const lang = detectLang();
  return <Navigate to={`/${lang}/`} replace />;
};

const LangLayout = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];

  const setLang = useCallback((newLang: Lang) => {
    const pathWithoutLang = location.pathname.replace(/^\/(ko|en|ja)/, '');
    navigate(`/${newLang}${pathWithoutLang || '/'}`, { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    document.documentElement.lang = validLang;
  }, [validLang]);

  if (!VALID_LANGS.includes(urlLang as Lang)) {
    return <Navigate to={`/${detectLang()}/`} replace />;
  }

  return (
    <LangContext.Provider value={{ lang: validLang, t, setLang }}>
      <Header lang={validLang} setLang={setLang} />
      <main id="main-content">
        <Outlet />
      </main>
    </LangContext.Provider>
  );
};

const LazyWrapper = ({ children, t }: { children: React.ReactNode; t?: Record<string, string> }) => (
  <ErrorBoundary t={t}>
    <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>
  </ErrorBoundary>
);

const SpriteWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><SpritePage lang={validLang} t={t} /></LazyWrapper>;
};

const EditorWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><PixelEditor lang={validLang} t={t} /></LazyWrapper>;
};

const LandingWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LandingPage lang={validLang} t={t} />;
};

const PrivacyWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><PrivacyPage lang={validLang} t={t} /></LazyWrapper>;
};

const TermsWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><TermsPage lang={validLang} t={t} /></LazyWrapper>;
};

const AboutWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><AboutPage lang={validLang} t={t} /></LazyWrapper>;
};

const GuideSpriteWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><GuideSpriteSheetPage lang={validLang} t={t} /></LazyWrapper>;
};

const GuidePixelArtWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><GuidePixelArtPage lang={validLang} t={t} /></LazyWrapper>;
};

const ConverterWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><ConverterPage lang={validLang} t={t} /></LazyWrapper>;
};

const GalleryWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><GalleryPage lang={validLang} t={t} /></LazyWrapper>;
};

const PostDetailWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><PostDetailPage lang={validLang} t={t} /></LazyWrapper>;
};

const FaqWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><FaqPage lang={validLang} t={t} /></LazyWrapper>;
};

const ContactWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><ContactPage lang={validLang} t={t} /></LazyWrapper>;
};

const GuidelinesWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><GuidelinesPage lang={validLang} t={t} /></LazyWrapper>;
};

const BlogListWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><BlogListPage lang={validLang} t={t} /></LazyWrapper>;
};

const BlogPostWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><BlogPostPage lang={validLang} t={t} /></LazyWrapper>;
};

const BoardWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><BoardPage lang={validLang} t={t} /></LazyWrapper>;
};

const BoardDetailWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><BoardDetailPage lang={validLang} t={t} /></LazyWrapper>;
};

const SoundWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><SoundPage lang={validLang} t={t} /></LazyWrapper>;
};

const SoundDetailWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <LazyWrapper t={t}><SoundDetailPage lang={validLang} t={t} /></LazyWrapper>;
};

const NotFoundWrapper = () => {
  const { lang: urlLang } = useParams<{ lang: string }>();
  const validLang: Lang = toValidLang(urlLang);
  const t = i18n[validLang];
  return <NotFoundPage lang={validLang} t={t} />;
};

const RootNotFoundWrapper = () => {
  const lang = detectLang();
  const t = i18n[lang];
  return (
    <LangContext.Provider value={{ lang, t, setLang: () => {} }}>
      <Header lang={lang} setLang={() => {}} />
      <main id="main-content">
        <NotFoundPage lang={lang} t={t} />
      </main>
    </LangContext.Provider>
  );
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
      { path: 'gallery', element: <GalleryWrapper /> },
      { path: 'gallery/:postId', element: <PostDetailWrapper /> },
      { path: 'faq', element: <FaqWrapper /> },
      { path: 'contact', element: <ContactWrapper /> },
      { path: 'guidelines', element: <GuidelinesWrapper /> },
      { path: 'blog', element: <BlogListWrapper /> },
      { path: 'blog/:slug', element: <BlogPostWrapper /> },
      { path: 'board', element: <BoardWrapper /> },
      { path: 'board/:postId', element: <BoardDetailWrapper /> },
      { path: 'sounds', element: <SoundWrapper /> },
      { path: 'sounds/:soundId', element: <SoundDetailWrapper /> },
      { path: '*', element: <NotFoundWrapper /> },
    ],
  },
  { path: '*', element: <RootNotFoundWrapper /> },
]);

export const App = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('spritfy-theme') as Theme) || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('spritfy-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <AuthProvider>
        <RouterProvider router={router} />
        <AuthModal />
      </AuthProvider>
    </ThemeContext.Provider>
  );
};

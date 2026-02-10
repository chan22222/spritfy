import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const LANGS = ['ko', 'en'] as const;
const BASE_URL = 'https://spritfy.xyz';

interface RouteMeta {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
  lang: string;
  hreflangAlternates: Array<{ lang: string; url: string }>;
}

const BASE_ROUTES = ['/', '/editor', '/sprite', '/converter', '/guide/sprite-sheet', '/guide/pixel-art', '/about', '/privacy', '/terms'];

const ROUTE_PRIORITY: Record<string, { priority: string; changefreq: string }> = {
  '/': { priority: '1.0', changefreq: 'weekly' },
  '/editor': { priority: '1.0', changefreq: 'weekly' },
  '/sprite': { priority: '0.8', changefreq: 'weekly' },
  '/converter': { priority: '0.8', changefreq: 'weekly' },
  '/guide/sprite-sheet': { priority: '0.7', changefreq: 'monthly' },
  '/guide/pixel-art': { priority: '0.7', changefreq: 'monthly' },
  '/about': { priority: '0.5', changefreq: 'monthly' },
  '/privacy': { priority: '0.3', changefreq: 'monthly' },
  '/terms': { priority: '0.3', changefreq: 'monthly' },
};

const SEO_META: Record<string, Record<string, { title: string; description: string }>> = {
  ko: {
    '/': {
      title: '스프릿파이(Spritfy) - 무료 픽셀 아트 에디터 & 스프라이트 시트 & 이미지 변환 | 도트 그림 툴',
      description: '스프릿파이 - 무료 온라인 픽셀 아트 에디터, 스프라이트 시트 생성기, 동영상/GIF 스프라이트 시트 변환기. 브라우저에서 바로 도트 그림을 그리고, 동영상을 스프라이트 시트로 변환하세요.',
    },
    '/editor': {
      title: '픽셀 아트 에디터 - 스프릿파이 | 무료 온라인 도트 그림 툴',
      description: '브라우저에서 바로 픽셀 아트를 그리세요. 레이어, 애니메이션, 팔레트 프리셋, GIF 내보내기를 지원하는 무료 온라인 도트 에디터.',
    },
    '/sprite': {
      title: '스프라이트 시트 생성기 - 스프릿파이 | 동영상/GIF를 시트로 변환',
      description: '동영상과 GIF를 스프라이트 시트로 변환하세요. 프레임 추출, 시트 레이아웃 설정, PNG 내보내기를 지원하는 무료 온라인 스프라이트 생성기.',
    },
    '/converter': {
      title: '이미지 포맷 변환기 - 스프릿파이 | PNG, JPG, WebP, ICO 변환',
      description: 'PNG, JPG, WebP, GIF, BMP, ICO 등 다양한 이미지 포맷을 무료로 변환하세요. 브라우저에서 바로 변환, 설치 불필요.',
    },
    '/guide/sprite-sheet': {
      title: '스프라이트 시트 가이드 - 스프릿파이 | 스프라이트 시트 만드는 법',
      description: '스프라이트 시트란 무엇인지, 어떻게 만드는지 알아보세요. 게임 개발과 애니메이션을 위한 스프라이트 시트 제작 가이드.',
    },
    '/guide/pixel-art': {
      title: '픽셀 아트 가이드 - 스프릿파이 | 도트 그림 그리는 법',
      description: '픽셀 아트(도트 그림)의 기초부터 알아보세요. 초보자를 위한 픽셀 아트 제작 가이드와 팁.',
    },
    '/about': {
      title: '소개 - 스프릿파이 | Spritfy',
      description: '스프릿파이(Spritfy) 소개 페이지. 무료 온라인 픽셀 아트 에디터 및 스프라이트 시트 생성기.',
    },
    '/privacy': {
      title: '개인정보처리방침 - 스프릿파이 | Spritfy',
      description: '스프릿파이(Spritfy) 개인정보처리방침.',
    },
    '/terms': {
      title: '이용약관 - 스프릿파이 | Spritfy',
      description: '스프릿파이(Spritfy) 서비스 이용약관.',
    },
  },
  en: {
    '/': {
      title: 'Spritfy - Free Pixel Art Editor & Sprite Sheet Generator & Image Converter',
      description: 'Free online pixel art editor, sprite sheet generator, and video/GIF to sprite sheet converter. Create pixel art and convert videos to sprite sheets right in your browser.',
    },
    '/editor': {
      title: 'Pixel Art Editor - Spritfy | Free Online Dot Art Tool',
      description: 'Create pixel art directly in your browser. Free editor with layers, animations, palette presets, and GIF export.',
    },
    '/sprite': {
      title: 'Sprite Sheet Generator - Spritfy | Video/GIF to Sheet',
      description: 'Convert videos and GIFs to sprite sheets. Extract frames, configure sheet layout, and export as PNG with this free online sprite generator.',
    },
    '/converter': {
      title: 'Image Format Converter - Spritfy | PNG, JPG, WebP, ICO',
      description: 'Convert images between PNG, JPG, WebP, GIF, BMP, ICO formats for free. Convert directly in your browser, no installation needed.',
    },
    '/guide/sprite-sheet': {
      title: 'Sprite Sheet Guide - Spritfy | How to Make Sprite Sheets',
      description: 'Learn what sprite sheets are and how to create them. A guide to sprite sheet creation for game development and animation.',
    },
    '/guide/pixel-art': {
      title: 'Pixel Art Guide - Spritfy | How to Draw Pixel Art',
      description: 'Learn pixel art from basics to advanced techniques. A beginner-friendly guide to creating pixel art.',
    },
    '/about': {
      title: 'About - Spritfy',
      description: 'About Spritfy. A free online pixel art editor, sprite sheet generator, and image format converter.',
    },
    '/privacy': {
      title: 'Privacy Policy - Spritfy',
      description: 'Spritfy Privacy Policy.',
    },
    '/terms': {
      title: 'Terms of Service - Spritfy',
      description: 'Spritfy Terms of Service.',
    },
  },
};

function buildRouteMeta(lang: string, route: string): RouteMeta {
  const seo = SEO_META[lang][route];
  const langPath = route === '/' ? '/' : route;
  const canonical = `${BASE_URL}/${lang}${langPath}`;
  const altLang = lang === 'ko' ? 'en' : 'ko';
  const altUrl = `${BASE_URL}/${altLang}${langPath}`;

  return {
    title: seo.title,
    description: seo.description,
    canonical,
    ogTitle: seo.title,
    ogDescription: seo.description,
    ogUrl: canonical,
    lang,
    hreflangAlternates: [
      { lang, url: canonical },
      { lang: altLang, url: altUrl },
      { lang: 'x-default', url: `${BASE_URL}/en${langPath}` },
    ],
  };
}

function injectMetaTags(html: string, meta: RouteMeta): string {
  let result = html;

  // <html lang=""> 교체
  result = result.replace(
    /<html\s+lang="[^"]*"/,
    `<html lang="${meta.lang}"`
  );

  // <title> 태그 교체
  result = result.replace(
    /<title>[^<]*<\/title>/,
    `<title>${meta.title}</title>`
  );

  // <meta name="description"> 교체
  result = result.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${meta.description}" />`
  );

  // <link rel="canonical"> 추가/교체
  if (result.includes('rel="canonical"')) {
    result = result.replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
      `<link rel="canonical" href="${meta.canonical}" />`
    );
  } else {
    result = result.replace(
      '</head>',
      `  <link rel="canonical" href="${meta.canonical}" />\n</head>`
    );
  }

  // hreflang 태그 삽입
  const hreflangTags = meta.hreflangAlternates
    .map(alt => `  <link rel="alternate" hreflang="${alt.lang}" href="${alt.url}" />`)
    .join('\n');
  result = result.replace(
    '</head>',
    `${hreflangTags}\n</head>`
  );

  // OG 태그 교체
  result = result.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${meta.ogTitle}" />`
  );
  result = result.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${meta.ogDescription}" />`
  );
  result = result.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${meta.ogUrl}" />`
  );
  result = result.replace(
    /<meta\s+property="og:locale"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:locale" content="${meta.lang === 'ko' ? 'ko_KR' : 'en_US'}" />`
  );

  // Twitter 태그 교체
  result = result.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${meta.ogTitle}" />`
  );
  result = result.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${meta.ogDescription}" />`
  );

  return result;
}

function generateSitemap(): string {
  const today = new Date().toISOString().split('T')[0];
  const entries: string[] = [];

  for (const route of BASE_ROUTES) {
    for (const lang of LANGS) {
      const langPath = route === '/' ? '/' : route;
      const loc = `${BASE_URL}/${lang}${langPath}`;
      const meta = ROUTE_PRIORITY[route];

      const alternates = LANGS.map(l => {
        const altPath = route === '/' ? '/' : route;
        return `    <xhtml:link rel="alternate" hreflang="${l}" href="${BASE_URL}/${l}${altPath}" />`;
      }).join('\n');
      const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE_URL}/en${langPath}" />`;

      entries.push(`  <url>
    <loc>${loc}</loc>
${alternates}
${xDefault}
    <lastmod>${today}</lastmod>
    <changefreq>${meta.changefreq}</changefreq>
    <priority>${meta.priority}</priority>
  </url>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>`;
}

function prerenderPlugin(): Plugin {
  return {
    name: 'vite-prerender-routes',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const indexHtmlPath = path.join(distDir, 'index.html');

      if (!fs.existsSync(indexHtmlPath)) {
        return;
      }

      const baseHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

      // 각 언어 x 각 라우트에 대해 HTML 생성
      for (const lang of LANGS) {
        for (const route of BASE_ROUTES) {
          const meta = buildRouteMeta(lang, route);
          const langRoute = route === '/' ? lang : `${lang}${route}`;
          const routeDir = path.join(distDir, langRoute);
          fs.mkdirSync(routeDir, { recursive: true });
          const routeHtml = injectMetaTags(baseHtml, meta);
          fs.writeFileSync(path.join(routeDir, 'index.html'), routeHtml, 'utf-8');
        }
      }

      // 루트 index.html을 리다이렉트 페이지로 교체
      const redirectHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="robots" content="noindex" />
  <title>Spritfy</title>
  <script>
    var lang = (navigator.language || '').startsWith('ko') ? 'ko' : 'en';
    window.location.replace('/' + lang + '/');
  </script>
</head>
<body></body>
</html>`;
      fs.writeFileSync(indexHtmlPath, redirectHtml, 'utf-8');

      // sitemap.xml 생성
      fs.writeFileSync(path.join(distDir, 'sitemap.xml'), generateSitemap(), 'utf-8');
    },
  };
}

export default defineConfig({
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      prerenderPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
});

import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

interface RouteMeta {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
}

const ROUTES_META: Record<string, RouteMeta> = {
  '/': {
    title: '스프릿파이(Spritfy) - 무료 픽셀 아트 에디터 & 스프라이트 시트 & 이미지 변환 | 도트 그림 툴',
    description: '스프릿파이 - 무료 온라인 픽셀 아트 에디터, 스프라이트 시트 생성기, 동영상/GIF 스프라이트 시트 변환기. 브라우저에서 바로 도트 그림을 그리고, 동영상을 스프라이트 시트로 변환하세요.',
    canonical: 'https://spritfy.xyz/',
    ogTitle: '스프릿파이(Spritfy) - 무료 픽셀 아트 에디터 & 스프라이트 시트 & 이미지 변환 | 도트 그림 툴',
    ogDescription: '스프릿파이 - 무료 온라인 픽셀 아트 에디터, 스프라이트 시트 생성기, 동영상/GIF 스프라이트 시트 변환기. 브라우저에서 바로 도트 그림을 그리고, 동영상을 스프라이트 시트로 변환하세요.',
    ogUrl: 'https://spritfy.xyz/',
  },
  '/editor': {
    title: '픽셀 아트 에디터 - 스프릿파이 | 무료 온라인 도트 그림 툴',
    description: '브라우저에서 바로 픽셀 아트를 그리세요. 레이어, 애니메이션, 팔레트 프리셋, GIF 내보내기를 지원하는 무료 온라인 도트 에디터.',
    canonical: 'https://spritfy.xyz/editor',
    ogTitle: '픽셀 아트 에디터 - 스프릿파이 | 무료 온라인 도트 그림 툴',
    ogDescription: '브라우저에서 바로 픽셀 아트를 그리세요. 레이어, 애니메이션, 팔레트 프리셋, GIF 내보내기를 지원하는 무료 온라인 도트 에디터.',
    ogUrl: 'https://spritfy.xyz/editor',
  },
  '/sprite': {
    title: '스프라이트 시트 생성기 - 스프릿파이 | 동영상/GIF를 시트로 변환',
    description: '동영상과 GIF를 스프라이트 시트로 변환하세요. 프레임 추출, 시트 레이아웃 설정, PNG 내보내기를 지원하는 무료 온라인 스프라이트 생성기.',
    canonical: 'https://spritfy.xyz/sprite',
    ogTitle: '스프라이트 시트 생성기 - 스프릿파이 | 동영상/GIF를 시트로 변환',
    ogDescription: '동영상과 GIF를 스프라이트 시트로 변환하세요. 프레임 추출, 시트 레이아웃 설정, PNG 내보내기를 지원하는 무료 온라인 스프라이트 생성기.',
    ogUrl: 'https://spritfy.xyz/sprite',
  },
  '/converter': {
    title: '이미지 포맷 변환기 - 스프릿파이 | PNG, JPG, WebP, ICO 변환',
    description: 'PNG, JPG, WebP, GIF, BMP, ICO 등 다양한 이미지 포맷을 무료로 변환하세요. 브라우저에서 바로 변환, 설치 불필요.',
    canonical: 'https://spritfy.xyz/converter',
    ogTitle: '이미지 포맷 변환기 - 스프릿파이 | PNG, JPG, WebP, ICO 변환',
    ogDescription: 'PNG, JPG, WebP, GIF, BMP, ICO 등 다양한 이미지 포맷을 무료로 변환하세요. 브라우저에서 바로 변환, 설치 불필요.',
    ogUrl: 'https://spritfy.xyz/converter',
  },
  '/guide/sprite-sheet': {
    title: '스프라이트 시트 가이드 - 스프릿파이 | 스프라이트 시트 만드는 법',
    description: '스프라이트 시트란 무엇인지, 어떻게 만드는지 알아보세요. 게임 개발과 애니메이션을 위한 스프라이트 시트 제작 가이드.',
    canonical: 'https://spritfy.xyz/guide/sprite-sheet',
    ogTitle: '스프라이트 시트 가이드 - 스프릿파이 | 스프라이트 시트 만드는 법',
    ogDescription: '스프라이트 시트란 무엇인지, 어떻게 만드는지 알아보세요. 게임 개발과 애니메이션을 위한 스프라이트 시트 제작 가이드.',
    ogUrl: 'https://spritfy.xyz/guide/sprite-sheet',
  },
  '/guide/pixel-art': {
    title: '픽셀 아트 가이드 - 스프릿파이 | 도트 그림 그리는 법',
    description: '픽셀 아트(도트 그림)의 기초부터 알아보세요. 초보자를 위한 픽셀 아트 제작 가이드와 팁.',
    canonical: 'https://spritfy.xyz/guide/pixel-art',
    ogTitle: '픽셀 아트 가이드 - 스프릿파이 | 도트 그림 그리는 법',
    ogDescription: '픽셀 아트(도트 그림)의 기초부터 알아보세요. 초보자를 위한 픽셀 아트 제작 가이드와 팁.',
    ogUrl: 'https://spritfy.xyz/guide/pixel-art',
  },
  '/about': {
    title: '소개 - 스프릿파이 | Spritfy',
    description: '스프릿파이(Spritfy) 소개 페이지. 무료 온라인 픽셀 아트 에디터 및 스프라이트 시트 생성기.',
    canonical: 'https://spritfy.xyz/about',
    ogTitle: '소개 - 스프릿파이 | Spritfy',
    ogDescription: '스프릿파이(Spritfy) 소개 페이지. 무료 온라인 픽셀 아트 에디터 및 스프라이트 시트 생성기.',
    ogUrl: 'https://spritfy.xyz/about',
  },
  '/privacy': {
    title: '개인정보처리방침 - 스프릿파이 | Spritfy',
    description: '스프릿파이(Spritfy) 개인정보처리방침.',
    canonical: 'https://spritfy.xyz/privacy',
    ogTitle: '개인정보처리방침 - 스프릿파이 | Spritfy',
    ogDescription: '스프릿파이(Spritfy) 개인정보처리방침.',
    ogUrl: 'https://spritfy.xyz/privacy',
  },
  '/terms': {
    title: '이용약관 - 스프릿파이 | Spritfy',
    description: '스프릿파이(Spritfy) 서비스 이용약관.',
    canonical: 'https://spritfy.xyz/terms',
    ogTitle: '이용약관 - 스프릿파이 | Spritfy',
    ogDescription: '스프릿파이(Spritfy) 서비스 이용약관.',
    ogUrl: 'https://spritfy.xyz/terms',
  },
};

function injectMetaTags(html: string, meta: RouteMeta): string {
  // <title> 태그 교체
  let result = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${meta.title}</title>`
  );

  // <meta name="description"> 교체
  result = result.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${meta.description}" />`
  );

  // <link rel="canonical"> 추가 (없으면 </head> 앞에 삽입)
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

      for (const [route, meta] of Object.entries(ROUTES_META)) {
        // '/' 라우트는 이미 dist/index.html에 해당
        if (route === '/') {
          const updatedHtml = injectMetaTags(baseHtml, meta);
          fs.writeFileSync(indexHtmlPath, updatedHtml, 'utf-8');
          continue;
        }

        // 라우트별 디렉토리 생성 및 index.html 복사
        const routeDir = path.join(distDir, route.slice(1));
        fs.mkdirSync(routeDir, { recursive: true });

        const routeHtml = injectMetaTags(baseHtml, meta);
        fs.writeFileSync(path.join(routeDir, 'index.html'), routeHtml, 'utf-8');
      }
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

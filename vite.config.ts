import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const LANGS = ['ko', 'en', 'ja'] as const;
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

const BASE_ROUTES = ['/', '/editor', '/sprite', '/converter', '/gallery', '/guide/sprite-sheet', '/guide/pixel-art', '/about', '/privacy', '/terms', '/faq', '/contact', '/guidelines', '/blog', '/board', '/sounds'];

const ROUTE_PRIORITY: Record<string, { priority: string; changefreq: string }> = {
  '/': { priority: '1.0', changefreq: 'weekly' },
  '/editor': { priority: '1.0', changefreq: 'weekly' },
  '/sprite': { priority: '0.8', changefreq: 'weekly' },
  '/converter': { priority: '0.8', changefreq: 'weekly' },
  '/gallery': { priority: '0.7', changefreq: 'daily' },
  '/guide/sprite-sheet': { priority: '0.7', changefreq: 'monthly' },
  '/guide/pixel-art': { priority: '0.7', changefreq: 'monthly' },
  '/about': { priority: '0.5', changefreq: 'monthly' },
  '/privacy': { priority: '0.3', changefreq: 'monthly' },
  '/terms': { priority: '0.3', changefreq: 'monthly' },
  '/faq': { priority: '0.6', changefreq: 'monthly' },
  '/contact': { priority: '0.4', changefreq: 'monthly' },
  '/guidelines': { priority: '0.4', changefreq: 'monthly' },
  '/blog': { priority: '0.7', changefreq: 'weekly' },
  '/board': { priority: '0.7', changefreq: 'daily' },
  '/sounds': { priority: '0.7', changefreq: 'daily' },
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
    '/gallery': {
      title: '커뮤니티 갤러리 - 스프릿파이 | 픽셀 아트 공유',
      description: '크리에이터들이 만든 픽셀 아트, 스프라이트 시트를 감상하고 공유하세요. 무료 온라인 픽셀 아트 갤러리.',
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
    '/faq': {
      title: '자주 묻는 질문(FAQ) - 스프릿파이 | Spritfy',
      description: '스프릿파이 자주 묻는 질문. 픽셀 아트 에디터, 스프라이트 시트, 이미지 변환기, 갤러리에 대한 FAQ.',
    },
    '/contact': {
      title: '문의하기 - 스프릿파이 | Spritfy',
      description: '스프릿파이에 문의사항이 있으시면 언제든 연락주세요. 버그 리포트, 제안, 비즈니스 문의를 받습니다.',
    },
    '/guidelines': {
      title: '커뮤니티 가이드라인 - 스프릿파이 | Spritfy',
      description: 'Spritfy 커뮤니티 가이드라인. 콘텐츠 기준, 업로드 규칙, 저작권 정책 안내.',
    },
    '/blog': {
      title: '블로그 - 스프릿파이 | 픽셀 아트 팁 & 튜토리얼',
      description: '픽셀 아트 팁, 스프라이트 시트 가이드, 게임 개발 튜토리얼. 스프릿파이 블로그.',
    },
    '/board': {
      title: '게시판 - 스프릿파이 | 커뮤니티 자유게시판',
      description: 'Spritfy 커뮤니티 게시판. 자유로운 토론, 질문, 팁 공유, 작품 자랑, 버그 제보.',
    },
    '/sounds': {
      title: '사운드 - 스프릿파이 | 게임 사운드 공유',
      description: '게임 사운드 이펙트와 음악을 공유하세요. BGM, 효과음, UI 사운드, 환경음, 보이스 클립.',
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
    '/gallery': {
      title: 'Community Gallery - Spritfy | Pixel Art Showcase',
      description: 'Browse and share pixel art and sprite sheets created by the community. Free online pixel art gallery.',
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
    '/faq': {
      title: 'FAQ - Spritfy | Frequently Asked Questions',
      description: 'Frequently asked questions about Spritfy. FAQ about the pixel art editor, sprite sheet generator, image converter, and community gallery.',
    },
    '/contact': {
      title: 'Contact Us - Spritfy',
      description: 'Get in touch with the Spritfy team. We welcome bug reports, suggestions, and business inquiries.',
    },
    '/guidelines': {
      title: 'Community Guidelines - Spritfy',
      description: 'Spritfy Community Guidelines. Content standards, upload rules, and copyright policies.',
    },
    '/blog': {
      title: 'Blog - Spritfy | Pixel Art Tips & Tutorials',
      description: 'Pixel art tips, sprite sheet guides, and game development tutorials. Spritfy Blog.',
    },
    '/board': {
      title: 'Board - Spritfy | Community Discussion Board',
      description: 'Spritfy community board. Free discussions, questions, tips, showcase, and bug reports.',
    },
    '/sounds': {
      title: 'Sounds - Spritfy | Game Sound Effects & Music',
      description: 'Share game sound effects and music. BGM, SFX, UI sounds, ambient, and voice clips.',
    },
  },
  ja: {
    '/': {
      title: 'Spritfy - 無料ドット絵エディター＆スプライトシート＆画像変換ツール | ピクセルアート',
      description: '無料オンラインドット絵エディター、スプライトシート生成ツール、動画/GIFスプライトシート変換ツール。ブラウザですぐにドット絵を描いたり、動画をスプライトシートに変換できます。',
    },
    '/editor': {
      title: 'ドット絵エディター - Spritfy | 無料オンラインピクセルアートツール',
      description: 'ブラウザですぐにドット絵が描けます。レイヤー、アニメーション、パレットプリセット、GIFエクスポート対応の無料オンラインドット絵エディター。',
    },
    '/sprite': {
      title: 'スプライトシート生成ツール - Spritfy | 動画/GIFをシートに変換',
      description: '動画やGIFをスプライトシートに変換。フレーム抽出、シートレイアウト設定、PNGエクスポート対応の無料オンラインスプライト生成ツール。',
    },
    '/converter': {
      title: '画像フォーマット変換ツール - Spritfy | PNG、JPG、WebP、ICO 変換',
      description: 'PNG、JPG、WebP、GIF、BMP、ICOなどの画像フォーマットを無料で変換。ブラウザ上で直接変換、インストール不要。',
    },
    '/gallery': {
      title: 'コミュニティギャラリー - Spritfy | ピクセルアート共有',
      description: 'クリエイターが作ったピクセルアート、スプライトシートを鑑賞・共有しましょう。無料オンラインピクセルアートギャラリー。',
    },
    '/guide/sprite-sheet': {
      title: 'スプライトシートガイド - Spritfy | スプライトシートの作り方',
      description: 'スプライトシートとは何か、どう作るかを学びましょう。ゲーム開発とアニメーションのためのスプライトシート制作ガイド。',
    },
    '/guide/pixel-art': {
      title: 'ドット絵ガイド - Spritfy | ピクセルアートの描き方',
      description: 'ドット絵（ピクセルアート）の基礎から学びましょう。初心者向けドット絵制作ガイドとヒント。',
    },
    '/about': {
      title: '概要 - Spritfy',
      description: 'Spritfyについて。無料オンラインドット絵エディター、スプライトシート生成ツール、画像フォーマット変換ツール。',
    },
    '/privacy': {
      title: 'プライバシーポリシー - Spritfy',
      description: 'Spritfy プライバシーポリシー。',
    },
    '/terms': {
      title: '利用規約 - Spritfy',
      description: 'Spritfy 利用規約。',
    },
    '/faq': {
      title: 'よくある質問(FAQ) - Spritfy',
      description: 'Spritfyのよくある質問。ピクセルアートエディタ、スプライトシート、画像変換、ギャラリーに関するFAQ。',
    },
    '/contact': {
      title: 'お問い合わせ - Spritfy',
      description: 'Spritfyへのお問い合わせ。バグ報告、ご提案、ビジネスに関するご相談をお待ちしております。',
    },
    '/guidelines': {
      title: 'コミュニティガイドライン - Spritfy',
      description: 'Spritfyコミュニティガイドライン。コンテンツ基準、アップロードルール、著作権ポリシー。',
    },
    '/blog': {
      title: 'ブログ - Spritfy | ドット絵のヒント＆チュートリアル',
      description: 'ドット絵のヒント、スプライトシートガイド、ゲーム開発チュートリアル。Spritfyブログ。',
    },
    '/board': {
      title: '掲示板 - Spritfy | コミュニティ掲示板',
      description: 'Spritfyコミュニティ掲示板。自由な議論、質問、ティップス共有、作品紹介、バグ報告。',
    },
    '/sounds': {
      title: 'サウンド - Spritfy | ゲームサウンドエフェクト＆音楽',
      description: 'ゲームサウンドエフェクトと音楽を共有しましょう。BGM、効果音、UIサウンド、環境音、ボイスクリップ。',
    },
  },
};

function buildRouteMeta(lang: string, route: string): RouteMeta {
  const seo = SEO_META[lang][route];
  const langPath = route === '/' ? '/' : route;
  const canonical = `${BASE_URL}/${lang}${langPath}`;

  return {
    title: seo.title,
    description: seo.description,
    canonical,
    ogTitle: seo.title,
    ogDescription: seo.description,
    ogUrl: canonical,
    lang,
    hreflangAlternates: [
      ...LANGS.map(l => ({ lang: l, url: `${BASE_URL}/${l}${langPath}` })),
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
    `<meta property="og:locale" content="${meta.lang === 'ko' ? 'ko_KR' : meta.lang === 'ja' ? 'ja_JP' : 'en_US'}" />`
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

function buildStructuredData(lang: string, route: string): string {
  const seo = SEO_META[lang][route];
  const langPath = route === '/' ? '/' : route;
  const canonical = `${BASE_URL}/${lang}${langPath}`;
  const inLanguage = lang === 'ko' ? 'ko-KR' : lang === 'ja' ? 'ja-JP' : 'en-US';

  const publisher = {
    '@type': 'Organization',
    name: 'Spritfy',
    url: BASE_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${BASE_URL}/spritfy-logo.svg`,
    },
  };

  const schemas: object[] = [];

  // 가이드 페이지: Article + FAQPage
  if (route === '/guide/sprite-sheet' || route === '/guide/pixel-art') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: seo.title,
      description: seo.description,
      author: { '@type': 'Organization', name: 'Spritfy' },
      publisher,
      datePublished: '2025-01-01',
      dateModified: '2026-02-24',
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      inLanguage,
    });

    const faqEntries =
      route === '/guide/sprite-sheet'
        ? lang === 'ko'
          ? [
              {
                q: '스프라이트 시트란 무엇인가요?',
                a: '스프라이트 시트는 여러 개의 이미지(프레임)를 하나의 큰 이미지 파일에 격자 형태로 배열한 것입니다. 게임 개발이나 웹 애니메이션에서 효율적으로 사용됩니다.',
              },
              {
                q: '스프라이트 시트를 어떻게 만드나요?',
                a: '스프릿파이의 스프라이트 시트 생성기를 사용하면 동영상이나 GIF를 업로드하여 자동으로 프레임을 추출하고 스프라이트 시트로 변환할 수 있습니다.',
              },
              {
                q: '스프라이트 시트의 장점은 무엇인가요?',
                a: 'HTTP 요청 횟수를 줄이고, 메모리 사용을 최적화하며, 애니메이션 재생 성능을 향상시킵니다.',
              },
            ]
          : lang === 'ja'
          ? [
              {
                q: 'スプライトシートとは何ですか？',
                a: 'スプライトシートとは、複数の画像（フレーム）を一枚の大きな画像ファイルにグリッド状に配列したものです。ゲーム開発やWebアニメーションで効率的に使用されます。',
              },
              {
                q: 'スプライトシートはどうやって作りますか？',
                a: 'Spritfyのスプライトシート生成ツールを使えば、動画やGIFをアップロードして自動的にフレームを抽出し、スプライトシートに変換できます。',
              },
              {
                q: 'スプライトシートのメリットは何ですか？',
                a: 'HTTPリクエスト数を削減し、メモリ使用量を最適化し、アニメーション再生のパフォーマンスを向上させます。',
              },
            ]
          : [
              {
                q: 'What is a sprite sheet?',
                a: 'A sprite sheet is a single image file that contains multiple smaller images (frames) arranged in a grid. It is commonly used in game development and web animations for efficient rendering.',
              },
              {
                q: 'How do I create a sprite sheet?',
                a: 'You can use Spritfy\'s sprite sheet generator to upload a video or GIF, automatically extract frames, and convert them into a sprite sheet.',
              },
              {
                q: 'What are the benefits of using sprite sheets?',
                a: 'Sprite sheets reduce HTTP requests, optimize memory usage, and improve animation playback performance.',
              },
            ]
        : lang === 'ko'
          ? [
              {
                q: '픽셀 아트란 무엇인가요?',
                a: '픽셀 아트는 개별 픽셀 단위로 그리는 디지털 아트 형식입니다. 레트로 게임 스타일의 그래픽을 만드는 데 널리 사용됩니다.',
              },
              {
                q: '픽셀 아트를 어떻게 시작하나요?',
                a: '스프릿파이의 픽셀 아트 에디터에서 캔버스 크기를 설정하고 픽셀 단위로 그림을 그릴 수 있습니다. 레이어와 팔레트 기능을 활용하면 더 효율적으로 작업할 수 있습니다.',
              },
              {
                q: '픽셀 아트에 적합한 캔버스 크기는?',
                a: '초보자에게는 16x16 또는 32x32 크기를 추천합니다. 캐릭터 스프라이트는 32x32 또는 64x64가 일반적입니다.',
              },
            ]
          : lang === 'ja'
          ? [
              {
                q: 'ドット絵とは何ですか？',
                a: 'ドット絵（ピクセルアート）とは、ピクセル単位で描くデジタルアートの形式です。レトロゲームスタイルのグラフィック制作に広く使われています。',
              },
              {
                q: 'ドット絵はどうやって始めますか？',
                a: 'Spritfyのドット絵エディターでキャンバスサイズを設定し、ピクセル単位で描くことができます。レイヤーやパレット機能を活用すると、より効率的に作業できます。',
              },
              {
                q: 'ドット絵に適したキャンバスサイズは？',
                a: '初心者には16x16または32x32がおすすめです。キャラクタースプライトは32x32または64x64が一般的です。',
              },
            ]
          : [
              {
                q: 'What is pixel art?',
                a: 'Pixel art is a form of digital art where images are created and edited at the pixel level. It is widely used for retro-style game graphics.',
              },
              {
                q: 'How do I start making pixel art?',
                a: 'You can use Spritfy\'s pixel art editor to set a canvas size and draw pixel by pixel. Use layers and palette features for more efficient workflow.',
              },
              {
                q: 'What canvas size is best for pixel art?',
                a: 'For beginners, 16x16 or 32x32 is recommended. Character sprites are commonly 32x32 or 64x64.',
              },
            ];

    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqEntries.map((entry) => ({
        '@type': 'Question',
        name: entry.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: entry.a,
        },
      })),
    });
  }

  // 도구 페이지: SoftwareApplication
  if (route === '/editor' || route === '/sprite' || route === '/converter') {
    const toolData: Record<string, Record<string, { name: string; category: string }>> = {
      ko: {
        '/editor': { name: '스프릿파이 픽셀 아트 에디터', category: 'DesignApplication' },
        '/sprite': { name: '스프릿파이 스프라이트 시트 생성기', category: 'MultimediaApplication' },
        '/converter': { name: '스프릿파이 이미지 포맷 변환기', category: 'MultimediaApplication' },
      },
      en: {
        '/editor': { name: 'Spritfy Pixel Art Editor', category: 'DesignApplication' },
        '/sprite': { name: 'Spritfy Sprite Sheet Generator', category: 'MultimediaApplication' },
        '/converter': { name: 'Spritfy Image Format Converter', category: 'MultimediaApplication' },
      },
      ja: {
        '/editor': { name: 'Spritfy ドット絵エディター', category: 'DesignApplication' },
        '/sprite': { name: 'Spritfy スプライトシート生成ツール', category: 'MultimediaApplication' },
        '/converter': { name: 'Spritfy 画像フォーマット変換ツール', category: 'MultimediaApplication' },
      },
    };

    const tool = toolData[lang][route];

    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: tool.name,
      description: seo.description,
      url: canonical,
      applicationCategory: tool.category,
      operatingSystem: 'All',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      inLanguage,
    });
  }

  // 랜딩 페이지: BreadcrumbList
  if (route === '/') {
    const itemListElement = [
      {
        '@type': 'ListItem',
        position: 1,
        name: lang === 'ko' ? '홈' : lang === 'ja' ? 'ホーム' : 'Home',
        item: `${BASE_URL}/${lang}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: lang === 'ko' ? '픽셀 아트 에디터' : lang === 'ja' ? 'ドット絵エディター' : 'Pixel Art Editor',
        item: `${BASE_URL}/${lang}/editor`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: lang === 'ko' ? '스프라이트 시트 생성기' : lang === 'ja' ? 'スプライトシート生成ツール' : 'Sprite Sheet Generator',
        item: `${BASE_URL}/${lang}/sprite`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: lang === 'ko' ? '이미지 변환기' : lang === 'ja' ? '画像変換ツール' : 'Image Converter',
        item: `${BASE_URL}/${lang}/converter`,
      },
    ];

    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement,
    });
  }

  // About 페이지: Organization
  if (route === '/about') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Spritfy',
      url: BASE_URL,
      logo: `${BASE_URL}/spritfy-logo.svg`,
      description:
        lang === 'ko'
          ? '무료 온라인 픽셀 아트 에디터, 스프라이트 시트 생성기, 이미지 포맷 변환기를 제공하는 웹 서비스입니다.'
          : lang === 'ja'
          ? '無料オンラインドット絵エディター、スプライトシート生成ツール、画像フォーマット変換ツールを提供するWebサービスです。'
          : 'A free online pixel art editor, sprite sheet generator, and image format converter.',
      sameAs: [],
    });
  }

  // FAQ 페이지: FAQPage 스키마
  if (route === '/faq') {
    const faqEntries = lang === 'ko'
      ? [
          { q: 'Spritfy는 어떤 서비스인가요?', a: 'Spritfy는 브라우저 기반의 무료 온라인 픽셀 아트 에디터이자 스프라이트 시트 생성기입니다.' },
          { q: 'Spritfy는 무료인가요?', a: '네, Spritfy의 모든 핵심 기능은 완전히 무료입니다.' },
          { q: '어떤 브라우저를 지원하나요?', a: 'Chrome, Firefox, Edge, Safari 등 최신 웹 브라우저에서 작동합니다.' },
          { q: '어떤 동영상 포맷을 지원하나요?', a: 'MP4, WebM 동영상 형식과 GIF 애니메이션 파일을 지원합니다.' },
          { q: '이미지 변환기에서 어떤 포맷을 지원하나요?', a: 'PNG, JPG, WebP, BMP, GIF, ICO 등 다양한 이미지 포맷 간의 변환을 지원합니다.' },
        ]
      : lang === 'ja'
      ? [
          { q: 'Spritfyとはどんなサービスですか？', a: 'Spritfyは、ブラウザベースの無料オンラインピクセルアートエディタ兼スプライトシートジェネレーターです。' },
          { q: 'Spritfyは無料ですか？', a: 'はい、Spritfyのすべてのコア機能は完全に無料です。' },
          { q: 'どのブラウザに対応していますか？', a: 'Chrome、Firefox、Edge、Safariなどの最新ブラウザで動作します。' },
          { q: 'どの動画フォーマットが対応していますか？', a: 'MP4とWebMの動画形式、およびGIFアニメーションファイルに対応しています。' },
          { q: '画像変換ツールはどのフォーマットに対応していますか？', a: 'PNG、JPG、WebP、BMP、GIF、ICOなど、さまざまな画像フォーマット間の変換に対応しています。' },
        ]
      : [
          { q: 'What is Spritfy?', a: 'Spritfy is a free browser-based online pixel art editor and sprite sheet generator.' },
          { q: 'Is Spritfy free to use?', a: 'Yes, all core features of Spritfy are completely free.' },
          { q: 'Which browsers are supported?', a: 'Spritfy works on modern web browsers including Chrome, Firefox, Edge, and Safari.' },
          { q: 'What video formats are supported?', a: 'The sprite sheet generator supports MP4 and WebM video formats as well as GIF animation files.' },
          { q: 'What formats does the image converter support?', a: 'It supports conversion between PNG, JPG, WebP, BMP, GIF, and ICO formats.' },
        ];

    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqEntries.map(entry => ({
        '@type': 'Question',
        name: entry.q,
        acceptedAnswer: { '@type': 'Answer', text: entry.a },
      })),
    });
  }

  // 블로그 페이지: Blog 스키마
  if (route === '/blog') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: seo.title,
      description: seo.description,
      url: canonical,
      publisher,
      inLanguage,
    });
  }

  // Contact 페이지: ContactPage 스키마
  if (route === '/contact') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: seo.title,
      description: seo.description,
      url: canonical,
      mainEntity: {
        '@type': 'Organization',
        name: 'Spritfy',
        email: 'hckwon@kakao.com',
      },
    });
  }

  if (schemas.length === 0) {
    return '';
  }

  return schemas
    .map(
      (schema) =>
        `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
    )
    .join('\n    ');
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
          let routeHtml = injectMetaTags(baseHtml, meta);
          const structuredData = buildStructuredData(lang, route);
          if (structuredData) {
            routeHtml = routeHtml.replace(
              '</head>',
              `    ${structuredData}\n</head>`
            );
          }
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
    var nav = navigator.language || '';
    var lang = nav.startsWith('ko') ? 'ko' : nav.startsWith('ja') ? 'ja' : 'en';
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

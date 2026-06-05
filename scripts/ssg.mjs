import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

const LANGS = ['ko', 'en', 'ja'];
const ROUTES = [
  '/',
  '/editor',
  '/sprite',
  '/converter',
  '/gallery',
  '/guide/sprite-sheet',
  '/guide/pixel-art',
  '/about',
  '/privacy',
  '/terms',
  '/faq',
  '/contact',
  '/guidelines',
  '/blog',
  '/board',
  '/sounds',
];

// vite 빌드가 생성한 블로그 개별 글 디렉토리(dist/<lang>/blog/<slug>)를 스캔해
// 프리렌더 대상에 동적으로 추가한다. blog-data.ts가 바뀌면 자동으로 반영된다.
function discoverBlogRoutes() {
  const blogDir = path.join(DIST_DIR, 'ko', 'blog');
  if (!fs.existsSync(blogDir)) return [];
  return fs
    .readdirSync(blogDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `/blog/${d.name}`);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};

function startStaticServer(distDir, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://localhost:${port}`);
      let urlPath = decodeURIComponent(parsedUrl.pathname);

      let filePath = path.join(distDir, urlPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      if (!fs.existsSync(filePath)) {
        const langMatch = urlPath.match(/^\/(ko|en|ja)(\/|$)/);
        if (langMatch) {
          filePath = path.join(distDir, langMatch[1], 'index.html');
        } else {
          filePath = path.join(distDir, 'index.html');
        }
      }

      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(port, () => {
      resolve(server);
    });
  });
}

// 광고/분석 스크립트만 차단한다. Supabase는 차단하지 않아야 갤러리/게시판/사운드
// 같은 DB 기반 페이지의 실제 데이터가 프리렌더(SSG)되어 크롤러에 노출된다.
const BLOCKED_PATTERNS = [
  'googletagmanager.com',
  'googlesyndication.com',
  'fundingchoicesmessages.google.com',
  'google-analytics.com',
  'googleads.g.doubleclick.net',
  'vercel.app/script.js',
  'railway.app/script.js',
];

async function renderRoute(browser, lang, route) {
  const urlPath = route === '/' ? `/${lang}/` : `/${lang}${route}`;
  const url = `${BASE}${urlPath}`;

  const htmlDir = route === '/'
    ? path.join(DIST_DIR, lang)
    : path.join(DIST_DIR, lang, ...route.split('/').filter(Boolean));
  const htmlFile = path.join(htmlDir, 'index.html');

  if (!fs.existsSync(htmlFile)) {
    return false;
  }

  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const reqUrl = req.url();
    if (BLOCKED_PATTERNS.some((p) => reqUrl.includes(p))) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

  // 루트에 콘텐츠가 채워지고, DB 기반 페이지의 로딩 스피너가 사라질 때까지 대기한다.
  // (gallery/board/sounds는 role="status" aria-label="Loading" 스피너를 쓰며,
  //  이게 사라지면 Supabase 데이터 fetch가 끝나 실제 콘텐츠가 렌더된 상태다.)
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      if (!root || root.innerHTML.trim().length <= 100) return false;
      const loading = document.querySelector('[role="status"][aria-label="Loading"]');
      return !loading;
    },
    { timeout: 20000 },
  );

  const rootHtml = await page.evaluate(() => {
    return document.getElementById('root').innerHTML;
  });

  let fileContent = fs.readFileSync(htmlFile, 'utf-8');
  fileContent = fileContent.replace(
    '<div id="root"></div>',
    `<div id="root">${rootHtml}</div>`,
  );
  fs.writeFileSync(htmlFile, fileContent, 'utf-8');

  await page.close();
  return true;
}

async function main() {
  if (!fs.existsSync(DIST_DIR)) {
    process.stderr.write('SSG FAILED: dist directory not found. Run "vite build" first.\n');
    process.exit(1);
  }

  // 프로덕션 빌드에서는 SSG 실패가 곧 빌드 실패가 되도록 한다.
  // Chromium이 없는 로컬 환경 등에서 의도적으로 프리렌더를 건너뛰려면 SSG_SKIP=true 를 명시한다.
  const allowSkip = process.env.SSG_SKIP === 'true';

  let browser;
  try {
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    browser = await puppeteer.launch(launchOptions);
  } catch (err) {
    if (allowSkip) {
      process.stdout.write(`SSG skipped (SSG_SKIP=true): Chromium launch failed — ${err.message}\n`);
      process.exit(0);
    }
    process.stderr.write(`\nSSG FAILED: could not launch Chromium.\n${err.message}\n`);
    process.stderr.write('Install Chromium (or set PUPPETEER_EXECUTABLE_PATH), or set SSG_SKIP=true to build without prerendering (NOT recommended for production).\n');
    process.exit(1);
  }

  const server = await startStaticServer(DIST_DIR, PORT);

  const routes = [...ROUTES, ...discoverBlogRoutes()];

  let rendered = 0;
  let failed = 0;
  const total = LANGS.length * routes.length;

  for (const lang of LANGS) {
    for (const route of routes) {
      const urlPath = route === '/' ? `/${lang}/` : `/${lang}${route}`;
      try {
        const success = await renderRoute(browser, lang, route);
        if (success) {
          rendered++;
          process.stdout.write(`  [${rendered}/${total}] ${urlPath}\n`);
        } else {
          failed++;
          process.stderr.write(`  [SKIP] ${urlPath} (file not found)\n`);
        }
      } catch (err) {
        failed++;
        process.stderr.write(`  [ERROR] ${urlPath} - ${err.message}\n`);
      }
    }
  }

  await browser.close();
  server.close();
  process.stdout.write(`\nSSG complete: ${rendered}/${total} pages prerendered, ${failed} failed.\n`);

  // 프리렌더 결과가 비어 있으면(=크롤러가 빈 HTML을 받게 됨) 빌드를 실패시켜 문제를 즉시 드러낸다.
  if (rendered === 0) {
    process.stderr.write('SSG FAILED: 0 pages prerendered — deploying this build would serve empty HTML to crawlers.\n');
    process.exit(allowSkip ? 0 : 1);
  }
  if (failed > 0 && !allowSkip) {
    process.stderr.write(`SSG FAILED: ${failed} page(s) did not prerender. Fix the errors above or set SSG_SKIP=true to bypass.\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`\nSSG FAILED: ${err.message}\n${err.stack || ''}\n`);
  process.exit(process.env.SSG_SKIP === 'true' ? 0 : 1);
});

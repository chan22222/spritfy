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

const BLOCKED_PATTERNS = [
  'googletagmanager.com',
  'googlesyndication.com',
  'fundingchoicesmessages.google.com',
  'google-analytics.com',
  'googleads.g.doubleclick.net',
  'vercel.app/script.js',
  'railway.app/script.js',
  'supabase.co',
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

  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return root && root.innerHTML.trim().length > 100;
    },
    { timeout: 15000 },
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
    process.exit(1);
  }

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
  } catch {
    process.stdout.write('SSG skipped: Chromium not available in this environment.\n');
    process.exit(0);
  }

  const server = await startStaticServer(DIST_DIR, PORT);

  let rendered = 0;
  const total = LANGS.length * ROUTES.length;

  for (const lang of LANGS) {
    for (const route of ROUTES) {
      const urlPath = route === '/' ? `/${lang}/` : `/${lang}${route}`;
      try {
        const success = await renderRoute(browser, lang, route);
        if (success) {
          rendered++;
          process.stdout.write(`  [${rendered}/${total}] ${urlPath}\n`);
        } else {
          process.stdout.write(`  [SKIP] ${urlPath} (file not found)\n`);
        }
      } catch (err) {
        process.stdout.write(`  [ERROR] ${urlPath} - ${err.message}\n`);
      }
    }
  }

  await browser.close();
  server.close();
  process.stdout.write(`\nSSG complete: ${rendered}/${total} pages rendered.\n`);
}

main().catch(() => {
  process.stdout.write('SSG skipped due to error.\n');
  process.exit(0);
});

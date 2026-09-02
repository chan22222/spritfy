import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { App } from '@/app.tsx';

const rootElement = document.getElementById('root')!;
const app = (
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

createRoot(rootElement).render(app);

// 서비스 워커는 프로덕션에서만 등록한다. 개발 서버에서는 network-first 캐시가
// 서버 재시작/응답 실패 시 오래된 모듈을 내주고 새 모듈(워커 등)을 503으로 만들어
// 화면이 반쯤 깨지는 문제가 있어, 개발 모드에서는 기존 등록도 해제한다.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js');
    } else {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      if ('caches' in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    }
  });
}

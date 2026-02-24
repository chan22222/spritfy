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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

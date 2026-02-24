import { createRoot, hydrateRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { App } from '@/app.tsx';

const rootElement = document.getElementById('root')!;
const app = (
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

if (rootElement.innerHTML.trim().length > 0) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}

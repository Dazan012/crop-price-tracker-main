import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ── Service Worker Registration (production only) ─────────────────────
// In development the SW's cache-first strategy serves stale builds, which
// causes old content (e.g. the previous hero image) to flash during load.
const isProd = process.env.NODE_ENV === 'production';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (!isProd) {
      // Development: purge any previously registered SW so stale assets
      // can never resurface during local dev.
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        if (window.caches) {
          const names = await window.caches.keys();
          await Promise.all(names.map((n) => window.caches.delete(n)));
        }
      } catch (err) {
        console.warn('[PWA] Failed to clean development service worker:', err);
      }
      return;
    }

    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registered:', registration.scope);

        // Check for updates periodically (every hour)
        setInterval(() => registration.update(), 60 * 60 * 1000);

        // When a new SW is waiting, prompt user to refresh
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content available — notify user
              if (window.confirm('A new version of Smart Crops is available. Reload to update?')) {
                window.location.reload();
              }
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
  });
}

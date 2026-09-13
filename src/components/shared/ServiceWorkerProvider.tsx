'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker una sola vez al montar. Va en un componente
 * cliente aparte para que `layout.tsx` siga siendo un Server Component.
 */
export function ServiceWorkerProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // En desarrollo el SW cachearía bundles de HMR y rompería el refresco.
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* Sin SW la app sigue funcionando: IndexedDB ya es offline-first. */
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}

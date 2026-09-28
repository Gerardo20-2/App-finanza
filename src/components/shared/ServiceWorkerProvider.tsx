'use client';

import { useEffect } from 'react';

import { BASE_PATH, withBasePath } from '@/lib/basePath';

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
      // En GitHub Pages la app vive bajo `/<repo>/`: el SW y su alcance también.
      navigator.serviceWorker.register(withBasePath('/sw.js'), { scope: `${BASE_PATH}/` }).catch(() => {
        /* Sin SW la app sigue funcionando: IndexedDB ya es offline-first. */
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}

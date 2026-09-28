/**
 * Dos modos de build:
 *
 * - `npm run build`        → servidor Next normal (dev, Vercel, `next start`).
 * - `npm run build:static` → sitio 100% estático en `out/` para GitHub Pages.
 *
 * GitHub Pages sirve los proyectos bajo `https://<usuario>.github.io/<repo>/`,
 * así que el export necesita ese prefijo en `NEXT_PUBLIC_BASE_PATH`
 * (p. ej. `/App-finanza`). El workflow de despliegue lo toma de
 * `actions/configure-pages`; en local queda vacío y la app vive en `/`.
 */
const isStaticExport = process.env.STATIC_EXPORT === 'true';
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isStaticExport
    ? {
        output: 'export',
        basePath,
        // `/history/` → `history/index.html`: GitHub Pages no reescribe rutas.
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        // `headers` no existe en el export estático; en Pages el SW se sirve
        // con los encabezados por defecto, que ya bastan para registrarlo.
        headers: async () => [
          {
            source: '/sw.js',
            headers: [
              { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
              { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
              { key: 'Service-Worker-Allowed', value: '/' },
            ],
          },
        ],
      }),
};

export default nextConfig;

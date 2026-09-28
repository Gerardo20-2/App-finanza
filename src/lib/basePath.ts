/**
 * Prefijo de despliegue (`/App-finanza` en GitHub Pages, vacío en local).
 *
 * `next/link` y el router ya lo aplican solos; esto es para las URLs que Next
 * no toca: metadatos (manifest, iconos) y el registro del service worker.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}

import type { Metadata, Viewport } from 'next';

import { BottomNav } from '@/components/shared/BottomNav';
import { ServiceWorkerProvider } from '@/components/shared/ServiceWorkerProvider';
import { withBasePath } from '@/lib/basePath';

import './globals.css';

export const metadata: Metadata = {
  title: 'DiDi Analytics & Tracker',
  description:
    'Controla en tiempo real cuánto puedes gastar hoy sin quedarte sin comer ni sin gasolina el fin de semana.',
  applicationName: 'DiDiTracker',
  // Next no antepone `basePath` a estas URLs de metadatos: se hace a mano.
  manifest: withBasePath('/manifest.json'),
  appleWebApp: {
    capable: true,
    title: 'DiDiTracker',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: withBasePath('/icons/icon.svg'), type: 'image/svg+xml' }],
    apple: [{ url: withBasePath('/icons/apple-icon.png'), sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  // Mismo color que `theme_color` del manifest (barra de estado y splash).
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className="dark">
      <body className="min-h-[100dvh] bg-zinc-950">
        <ServiceWorkerProvider />
        {/* pb-24 deja aire para la navegación fija. */}
        <div className="mx-auto min-h-[100dvh] w-full max-w-md pb-24">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}

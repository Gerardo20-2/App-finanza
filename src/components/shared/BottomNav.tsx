'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { BarChart3, History, Settings, Wallet } from 'lucide-react';

import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/', label: 'Hoy', icon: Wallet },
  { href: '/history', label: 'Historial', icon: History },
  { href: '/analytics', label: 'Analítica', icon: BarChart3 },
  { href: '/settings', label: 'Ajustes', icon: Settings },
] as const;

/** Navegación fija tipo app nativa, con indicador deslizante compartido. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 transition-colors',
                  isActive ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {isActive ? (
                  <motion.span
                    layoutId="bottom-nav-active"
                    className="absolute inset-x-3 -top-px h-0.5 rounded-full bg-emerald-400"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
                <span className="text-[10px] font-medium tracking-wide">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

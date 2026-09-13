'use client';

import { motion } from 'framer-motion';

import type { DayUsage } from '@/lib/budgetEngine';
import { cn, formatCompactCurrency, formatDayInitial } from '@/lib/utils';

interface SprintDayDotsProps {
  days: DayUsage[];
  /** Cupo ideal por día: define si un día quedó en verde, ámbar o rojo. */
  idealDailyBurn: number;
  currencySymbol: string;
  className?: string;
}

type DotTone = 'future' | 'under' | 'near' | 'over' | 'today' | 'empty';

function toneFor(day: DayUsage, ideal: number): DotTone {
  if (day.isToday) return 'today';
  if (day.isFuture) return 'future';
  if (day.spent === 0) return 'empty';
  if (ideal <= 0) return 'under';

  const ratio = day.spent / ideal;
  if (ratio <= 0.85) return 'under';
  if (ratio <= 1.1) return 'near';
  return 'over';
}

const DOT_STYLES: Record<DotTone, string> = {
  future: 'border-zinc-800 bg-zinc-900 text-zinc-700',
  empty: 'border-zinc-700 bg-zinc-900 text-zinc-500',
  under: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  near: 'border-amber-400/40 bg-amber-400/15 text-amber-300',
  over: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
  today: 'border-zinc-100 bg-zinc-100 text-zinc-900',
};

/** Los 7 días del ciclo como una fila de círculos: el "sprint" de la semana. */
export function SprintDayDots({
  days,
  idealDailyBurn,
  currencySymbol,
  className,
}: SprintDayDotsProps) {
  return (
    <div className={cn('flex items-start justify-between gap-1', className)}>
      {days.map((day, index) => {
        const tone = toneFor(day, idealDailyBurn);

        return (
          <div key={day.dateKey} className="flex flex-1 flex-col items-center gap-1.5">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.035, type: 'spring', stiffness: 320, damping: 26 }}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold transition-colors',
                DOT_STYLES[tone],
                day.isToday && 'ring-2 ring-zinc-100/20 ring-offset-2 ring-offset-zinc-950',
              )}
              title={`Día ${day.day}: ${formatCompactCurrency(day.spent, currencySymbol)}`}
            >
              {formatDayInitial(day.date)}
            </motion.div>

            <span
              className={cn(
                'text-[10px] tabular-nums leading-none',
                day.isFuture ? 'text-zinc-700' : day.isToday ? 'text-zinc-300' : 'text-zinc-600',
              )}
            >
              {day.isFuture ? '—' : formatCompactCurrency(day.spent, currencySymbol)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

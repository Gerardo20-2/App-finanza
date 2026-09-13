'use client';

import { useEffect, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useSpring } from 'framer-motion';
import { Flame, Skull } from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { STATUS_META, type BudgetSnapshot } from '@/lib/budgetEngine';
import { cn, formatCurrency, formatSignedCurrency } from '@/lib/utils';

const SIZE = 260;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Contador que interpola hasta el valor nuevo en vez de saltar. */
function AnimatedAmount({
  value,
  symbol,
  className,
}: {
  value: number;
  symbol: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const spring = useSpring(value, { stiffness: 140, damping: 22, mass: 0.7 });
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    spring.set(value);
  }, [value, spring, reduceMotion]);

  useMotionValueEvent(spring, 'change', (latest) => {
    if (!reduceMotion) setDisplay(latest);
  });

  return (
    <span className={cn('tabular-nums', className)}>{formatCurrency(display, symbol)}</span>
  );
}

interface DailyBurnGaugeProps {
  snapshot: BudgetSnapshot;
}

/**
 * Elemento héroe del dashboard: anillo SVG reactivo con el cupo disponible del
 * día. El arco representa la fracción del cupo que aún NO se gasta, así que se
 * ve vaciarse conforme avanza el día.
 */
export function DailyBurnGauge({ snapshot }: DailyBurnGaugeProps) {
  const reduceMotion = useReducedMotion();
  const meta = STATUS_META[snapshot.status];
  const { isSurvivalMode, availableRatio, availableToday, dailyAllowance, spentToday } = snapshot;

  const ratio = isSurvivalMode ? 0 : availableRatio;
  const offset = CIRCUMFERENCE * (1 - ratio);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="burn-gauge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={meta.ring} stopOpacity={0.75} />
              <stop offset="100%" stopColor={meta.ring} stopOpacity={1} />
            </linearGradient>
            <filter id="burn-gauge-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Pista */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#27272a"
            strokeWidth={STROKE}
          />

          {/* Arco de cupo disponible */}
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="url(#burn-gauge-gradient)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            filter="url(#burn-gauge-glow)"
            initial={false}
            animate={{ strokeDashoffset: offset }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 90, damping: 20, mass: 0.9 }
            }
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          {isSurvivalMode ? (
            <>
              <Skull className="mb-2 h-8 w-8 text-rose-500" strokeWidth={2} />
              <span className="text-5xl font-bold tabular-nums tracking-tight text-rose-400">
                {formatCurrency(0, snapshot.currencySymbol)}
              </span>
              <span className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-400/80">
                Modo supervivencia
              </span>
            </>
          ) : (
            <>
              <AnimatedAmount
                value={availableToday}
                symbol={snapshot.currencySymbol}
                className={cn(
                  'text-[2.75rem] font-bold leading-none tracking-tight',
                  availableToday > 0 ? 'text-zinc-50' : 'text-rose-400',
                )}
              />
              <span className="mt-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                Disponible para hoy
              </span>
              <span className="mt-1 text-xs text-zinc-600">
                de {formatCurrency(dailyAllowance, snapshot.currencySymbol)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Gastado hoy vs cupo máximo del día */}
      <div className="mt-5 w-full max-w-[280px] space-y-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="flex items-center gap-1.5 text-zinc-500">
            <Flame className="h-3.5 w-3.5" strokeWidth={2.4} />
            Gastado hoy
          </span>
          <span className="font-semibold tabular-nums text-zinc-300">
            {formatCurrency(spentToday, snapshot.currencySymbol)}
            <span className="text-zinc-600">
              {' / '}
              {formatCurrency(dailyAllowance, snapshot.currencySymbol)}
            </span>
          </span>
        </div>

        <Progress
          value={snapshot.usedRatio}
          indicatorClassName={cn(
            snapshot.status === 'healthy' && 'bg-emerald-500',
            snapshot.status === 'caution' && 'bg-amber-400',
            (snapshot.status === 'critical' || snapshot.status === 'survival') && 'bg-rose-500',
          )}
        />

        {snapshot.overspentToday > 0 ? (
          <p className="text-center text-xs font-medium text-rose-400">
            Te pasaste {formatCurrency(snapshot.overspentToday, snapshot.currencySymbol)} del cupo de hoy
          </p>
        ) : snapshot.surplus.daysToSpread > 0 ? (
          <p className="text-center text-xs text-zinc-500">
            Si cierras así,{' '}
            <span
              className={cn(
                'font-semibold',
                snapshot.surplus.perDayDelta >= 0 ? 'text-emerald-400' : 'text-rose-400',
              )}
            >
              {formatSignedCurrency(snapshot.surplus.perDayDelta, snapshot.currencySymbol)}
            </span>{' '}
            por día para los {snapshot.surplus.daysToSpread} que faltan
          </p>
        ) : (
          <p className="text-center text-xs text-zinc-500">Último día del ciclo</p>
        )}
      </div>
    </div>
  );
}

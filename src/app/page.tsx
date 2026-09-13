'use client';

import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Plus, RotateCcw, Trash2 } from 'lucide-react';

import { DailyBurnGauge } from '@/components/dashboard/DailyBurnGauge';
import { GasReserveCard } from '@/components/dashboard/GasReserveCard';
import { QuickExpenseBar, type QuickAction } from '@/components/dashboard/QuickExpenseBar';
import { SprintDayDots } from '@/components/dashboard/SprintDayDots';
import {
  CycleResetModal,
  type CycleResetValues,
} from '@/components/modals/CycleResetModal';
import {
  FullExpenseModal,
  type FullExpenseSubmit,
} from '@/components/modals/FullExpenseModal';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useHapticSound, type FeedbackTone } from '@/hooks/useHapticSound';
import { useWeeklyBudget } from '@/hooks/useWeeklyBudget';
import {
  CATEGORY_LABELS,
  SURVIVAL_MEALS,
  type BudgetSnapshot,
  type ExpenseCategory,
} from '@/lib/budgetEngine';
import { cn, formatCurrency, formatLongDate, formatTime } from '@/lib/utils';

/** Elige el tono del feedback a partir del estado que deja el gasto. */
function toneFor(snapshot: BudgetSnapshot | null, category: ExpenseCategory): FeedbackTone {
  if (!snapshot) return 'success';
  if (category === 'combustible') return snapshot.gas.overflow > 0 ? 'warning' : 'gas';
  if (snapshot.isSurvivalMode || snapshot.overspentToday > 0) return 'error';
  if (snapshot.status === 'critical') return 'warning';
  return 'success';
}

export default function DashboardPage() {
  const {
    isReady,
    settings,
    snapshot,
    cycle,
    dailyUsage,
    todayTransactions,
    addExpense,
    removeExpense,
    startCycle,
    closeCurrentCycle,
    now,
  } = useWeeklyBudget();

  const { play } = useHapticSound({
    sound: settings.soundFeedback,
    haptics: settings.hapticFeedback,
  });

  const [isExpenseOpen, setExpenseOpen] = useState(false);
  const [isResetOpen, setResetOpen] = useState(false);

  const register = useCallback(
    async (input: { amount: number; category: ExpenseCategory; note?: string; isQuickTap: boolean }) => {
      const projected = await addExpense(input);
      play(toneFor(projected, input.category));
    },
    [addExpense, play],
  );

  const handleQuickExpense = useCallback(
    (action: QuickAction) =>
      register({
        amount: action.amount,
        category: action.category,
        note: action.label,
        isQuickTap: true,
      }),
    [register],
  );

  const handleFullExpense = useCallback(
    (input: FullExpenseSubmit) => register({ ...input, isQuickTap: false }),
    [register],
  );

  const handleReset = useCallback(
    async (values: CycleResetValues) => {
      const rescued = snapshot
        ? Math.max(0, snapshot.remainingBalance) + snapshot.gas.remaining
        : 0;

      await closeCurrentCycle();
      await startCycle(values);
      play('success');

      // Refuerzo positivo por llegar al final de la semana con dinero.
      if (rescued > 0) {
        const { default: confetti } = await import('canvas-confetti');
        void confetti({
          particleCount: 90,
          spread: 68,
          startVelocity: 38,
          origin: { y: 0.68 },
          colors: ['#34d399', '#10b981', '#a7f3d0', '#fafafa'],
          disableForReducedMotion: true,
        });
      }
    },
    [closeCurrentCycle, startCycle, snapshot, play],
  );

  const resetDefaults = useMemo<CycleResetValues>(
    () => ({
      totalIncome: cycle?.totalIncome ?? settings.defaultWeeklyIncome,
      gasReserve: cycle?.gasReserve ?? settings.defaultGasReserve,
      fixedExpenses: cycle?.fixedExpenses ?? settings.defaultFixedExpenses,
    }),
    [cycle, settings],
  );

  if (!isReady || !snapshot) return <DashboardSkeleton />;

  const { progress, isSurvivalMode } = snapshot;
  const daysLeftLabel = progress.isFinished
    ? 'Ciclo terminado'
    : progress.isLastDay
      ? 'Último día'
      : `Faltan ${progress.daysRemaining - 1} ${progress.daysRemaining - 1 === 1 ? 'día' : 'días'}`;

  return (
    <main className={cn('relative min-h-[100dvh] px-4', isSurvivalMode && 'survival-backdrop')}>
      {/* Header */}
      <header className="flex items-start justify-between gap-3 pt-safe pb-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-300">
            Día {progress.dayIndex} de {progress.totalDays}
            <span className="mx-1.5 text-zinc-700">•</span>
            <span className="font-normal text-zinc-500">{daysLeftLabel}</span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-600 first-letter:uppercase">{formatLongDate(now)}</p>
        </div>
        <StatusBadge status={snapshot.status} />
      </header>

      {/* Ciclo vencido: cerrar antes de seguir registrando. */}
      <AnimatePresence>
        {progress.isFinished ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <Card className="flex items-center justify-between gap-3 border-amber-400/30 bg-amber-400/10 p-3.5">
              <span className="flex items-center gap-2 text-xs text-amber-200">
                <CalendarClock className="h-4 w-4 shrink-0" strokeWidth={2.3} />
                Esta semana ya terminó. Cierra el ciclo para recalcular tu cupo.
              </span>
              <Button size="sm" variant="secondary" onClick={() => setResetOpen(true)}>
                Cerrar
              </Button>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <DailyBurnGauge snapshot={snapshot} />

      <section className="mt-7">
        <h2 className="mb-2.5 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Sprint de la semana
        </h2>
        <Card className="p-3.5">
          <SprintDayDots
            days={dailyUsage}
            idealDailyBurn={snapshot.idealDailyBurn}
            currencySymbol={settings.currencySymbol}
          />
        </Card>
      </section>

      {isSurvivalMode ? <SurvivalPanel currencySymbol={settings.currencySymbol} /> : null}

      <section className="mt-6">
        <h2 className="mb-2.5 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Registro inmediato
        </h2>
        <QuickExpenseBar
          currencySymbol={settings.currencySymbol}
          onQuickExpense={handleQuickExpense}
          disabled={progress.isFinished}
        />
      </section>

      <section className="mt-6">
        <GasReserveCard gas={snapshot.gas} currencySymbol={settings.currencySymbol} />
      </section>

      <section className="mt-6">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Movimientos de hoy
          </h2>
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className="flex items-center gap-1 text-[11px] font-medium text-zinc-600 transition-colors hover:text-zinc-300"
          >
            <RotateCcw className="h-3 w-3" strokeWidth={2.4} />
            Cerrar semana
          </button>
        </div>

        {todayTransactions.length === 0 ? (
          <Card className="p-5 text-center">
            <p className="text-sm text-zinc-500">Todavía no gastas nada hoy.</p>
            <p className="mt-1 text-xs text-zinc-700">
              Cada peso que no gastes sube el cupo de los días que faltan.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {todayTransactions.map((item) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                >
                  <Card className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {item.note ?? CATEGORY_LABELS[item.category]}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-600">
                        {CATEGORY_LABELS[item.category]}
                        <span className="mx-1">·</span>
                        {formatTime(item.date)}
                        {item.isQuickTap ? (
                          <>
                            <span className="mx-1">·</span>1 toque
                          </>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <span
                        className={cn(
                          'text-sm font-bold tabular-nums',
                          item.category === 'combustible' ? 'text-sky-400' : 'text-zinc-200',
                        )}
                      >
                        −{formatCurrency(item.amount, settings.currencySymbol)}
                      </span>
                      <button
                        type="button"
                        aria-label="Eliminar gasto"
                        onClick={() => {
                          if (item.id === undefined) return;
                          play('tap');
                          void removeExpense(item.id);
                        }}
                        className="rounded-lg p-1.5 text-zinc-700 transition-colors hover:bg-zinc-800 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </button>
                    </div>
                  </Card>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {/* FAB */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 520, damping: 28 }}
        onClick={() => {
          play('tap');
          setExpenseOpen(true);
        }}
        aria-label="Registrar gasto manual"
        className={cn(
          'fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-[max(1rem,calc(50%-13rem))] z-30',
          'flex h-16 w-16 items-center justify-center rounded-full',
          'bg-emerald-500 text-emerald-950 shadow-xl shadow-emerald-500/25',
          'transition-colors hover:bg-emerald-400',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/30',
        )}
      >
        <Plus className="h-8 w-8" strokeWidth={2.6} />
      </motion.button>

      <FullExpenseModal
        open={isExpenseOpen}
        onOpenChange={setExpenseOpen}
        snapshot={snapshot}
        currencySymbol={settings.currencySymbol}
        onSubmit={handleFullExpense}
        onKeyFeedback={() => play('tap')}
      />

      <CycleResetModal
        open={isResetOpen}
        onOpenChange={setResetOpen}
        snapshot={snapshot}
        currencySymbol={settings.currencySymbol}
        defaults={resetDefaults}
        onConfirm={handleReset}
      />
    </main>
  );
}

/** Fondo carmesí + comidas de ultra bajo costo cuando el saldo llega a cero. */
function SurvivalPanel({ currencySymbol }: { currencySymbol: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6"
    >
      <Card className="border-rose-500/30 bg-rose-950/30 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-rose-300">
          Modo supervivencia
        </h2>
        <p className="mt-1.5 text-sm text-rose-100/80">
          Agotaste el presupuesto antes de cerrar la semana. Estas comidas te sacan del hoyo sin
          endeudarte.
        </p>

        <ul className="mt-3.5 space-y-1.5">
          {SURVIVAL_MEALS.map((meal) => (
            <li
              key={meal.name}
              className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/15 bg-rose-500/5 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-rose-50">{meal.name}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-rose-200/50">{meal.hint}</p>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-rose-300">
                {formatCurrency(meal.cost, currencySymbol)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </motion.section>
  );
}

function DashboardSkeleton() {
  return (
    <main className="min-h-[100dvh] px-4 pt-safe">
      <div className="h-10 w-2/3 animate-pulse rounded-lg bg-zinc-900" />
      <div className="mx-auto mt-8 h-[260px] w-[260px] animate-pulse rounded-full bg-zinc-900" />
      <div className="mt-8 space-y-3">
        <div className="h-20 animate-pulse rounded-2xl bg-zinc-900" />
        <div className="h-28 animate-pulse rounded-2xl bg-zinc-900" />
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-900" />
      </div>
    </main>
  );
}

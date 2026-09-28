'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { Archive, Trash2 } from 'lucide-react';

import { MileageAuditPanel } from '@/components/history/MileageAuditPanel';
import { Card } from '@/components/ui/card';
import { useHapticSound } from '@/hooks/useHapticSound';
import { useWeeklyBudget } from '@/hooks/useWeeklyBudget';
import {
  calculateBudget,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type ExpenseCategory,
} from '@/lib/budgetEngine';
import {
  db,
  getDailyLogsInRange,
  type DailyLog,
  type Transaction,
  type WeeklyCycle,
} from '@/lib/db';
import {
  cn,
  formatCurrency,
  formatDateRange,
  formatShortDate,
  formatTime,
  parseTimestamp,
  roundCurrency,
  toDateKey,
} from '@/lib/utils';

/** Umbral de arrastre (px) para confirmar el borrado. */
const SWIPE_THRESHOLD = 96;

function SwipeRow({
  transaction,
  currencySymbol,
  onDelete,
}: {
  transaction: Transaction;
  currencySymbol: string;
  onDelete: () => void;
}) {
  const x = useMotionValue(0);
  // El fondo rojo se revela conforme el dedo arrastra la tarjeta.
  const backgroundOpacity = useTransform(x, [-SWIPE_THRESHOLD, -24, 0], [1, 0.35, 0]);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <motion.div
        style={{ opacity: backgroundOpacity }}
        className="absolute inset-0 flex items-center justify-end bg-rose-500/20 pr-5"
      >
        <Trash2 className="h-4 w-4 text-rose-300" strokeWidth={2.3} />
      </motion.div>

      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={{ left: -140, right: 0 }}
        dragElastic={0.12}
        onDragEnd={(_, info) => {
          if (info.offset.x < -SWIPE_THRESHOLD) onDelete();
        }}
        className="relative touch-pan-y"
      >
        <Card className="flex items-center justify-between gap-3 p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="h-8 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[transaction.category] }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-200">
                {transaction.note ?? CATEGORY_LABELS[transaction.category]}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-600">
                {CATEGORY_LABELS[transaction.category]}
                <span className="mx-1">·</span>
                {formatTime(transaction.date)}
              </p>
            </div>
          </div>

          <span className="shrink-0 text-sm font-bold tabular-nums text-zinc-200">
            −{formatCurrency(transaction.amount, currencySymbol)}
          </span>
        </Card>
      </motion.div>
    </div>
  );
}

export default function HistoryPage() {
  const { settings, cycle, transactions, removeExpense, now } = useWeeklyBudget();
  const { play } = useHapticSound({
    sound: settings.soundFeedback,
    haptics: settings.hapticFeedback,
  });

  const [expandedCycleId, setExpandedCycleId] = useState<number | null>(null);

  const closedCycles = useLiveQuery<WeeklyCycle[], WeeklyCycle[]>(
    async () => {
      const all = await db.cycles.where('status').equals('closed').toArray();
      return all.sort((a, b) => b.startDate.localeCompare(a.startDate));
    },
    [],
    [],
  );

  const archivedTransactions = useLiveQuery<Transaction[], Transaction[]>(
    () =>
      expandedCycleId === null
        ? Promise.resolve([])
        : db.transactions.where('cycleId').equals(expandedCycleId).toArray(),
    [expandedCycleId],
    [],
  );

  const dailyLogs = useLiveQuery<DailyLog[], DailyLog[]>(
    () =>
      cycle ? getDailyLogsInRange(cycle.startDate, cycle.endDate) : Promise.resolve([]),
    [cycle?.startDate, cycle?.endDate],
    [],
  );

  const logsByDay = useMemo(
    () => new Map(dailyLogs.map((log) => [log.dateKey, log])),
    [dailyLogs],
  );

  const todayKey = toDateKey(now);

  /**
   * Tarjetas diarias del ciclo activo, de la más reciente a la más vieja. Un
   * día aparece si tiene movimientos, si ya tiene auditoría de km, o si es hoy
   * (para poder capturar el odómetro aunque todavía no haya gastos).
   */
  const groupedCurrent = useMemo(() => {
    const byDay = new Map<string, Transaction[]>();

    for (const item of [...transactions].sort((a, b) => b.date.localeCompare(a.date))) {
      // Día LOCAL, igual que el motor: `date` está en UTC y cortarlo directo
      // mandaría las cargas de la noche a la tarjeta del día siguiente.
      const key = toDateKey(parseTimestamp(item.date));
      const bucket = byDay.get(key);
      if (bucket) bucket.push(item);
      else byDay.set(key, [item]);
    }

    for (const log of dailyLogs) {
      if (!byDay.has(log.dateKey)) byDay.set(log.dateKey, []);
    }
    if (cycle && todayKey >= cycle.startDate && todayKey <= cycle.endDate && !byDay.has(todayKey)) {
      byDay.set(todayKey, []);
    }

    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dateKey, items]) => ({
        dateKey,
        items,
        total: items.reduce((sum, item) => sum + item.amount, 0),
        gas: roundCurrency(
          items
            .filter((item) => item.category === 'combustible')
            .reduce((sum, item) => sum + item.amount, 0),
        ),
      }));
  }, [transactions, dailyLogs, cycle, todayKey]);

  return (
    <main className="min-h-[100dvh] px-4 pt-safe">
      <header className="pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Historial</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Desliza un movimiento a la izquierda para borrarlo.
        </p>
      </header>

      {cycle ? (
        <section className="mb-7">
          <div className="mb-2.5 flex items-baseline justify-between">
            <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Semana en curso
            </h2>
            <span className="text-[11px] text-zinc-600">
              {formatDateRange(cycle.startDate, cycle.endDate)}
            </span>
          </div>

          {groupedCurrent.length === 0 ? (
            <Card className="p-5 text-center text-sm text-zinc-500">
              Sin movimientos en esta semana.
            </Card>
          ) : (
            <div className="space-y-4">
              {groupedCurrent.map((group) => (
                <div key={group.dateKey}>
                  <div className="mb-1.5 flex items-baseline justify-between px-1">
                    <span className="text-[11px] font-medium text-zinc-500 first-letter:uppercase">
                      {formatShortDate(parseTimestamp(group.dateKey))}
                    </span>
                    <span className="text-[11px] font-semibold tabular-nums text-zinc-600">
                      {formatCurrency(group.total, settings.currencySymbol)}
                    </span>
                  </div>

                  {group.items.length === 0 ? (
                    <p className="mb-2 px-1 text-[11px] text-zinc-600">Sin movimientos este día.</p>
                  ) : null}

                  <ul className="space-y-2">
                    <AnimatePresence initial={false}>
                      {group.items.map((item) => (
                        <motion.li
                          key={item.id}
                          layout
                          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <SwipeRow
                            transaction={item}
                            currencySymbol={settings.currencySymbol}
                            onDelete={() => {
                              if (item.id === undefined) return;
                              play('warning');
                              void removeExpense(item.id);
                            }}
                          />
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>

                  <div className="mt-2">
                    <MileageAuditPanel
                      dateKey={group.dateKey}
                      log={logsByDay.get(group.dateKey)}
                      gasolinaTotal={group.gas}
                      currencySymbol={settings.currencySymbol}
                      onToggle={() => play('tap')}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-zinc-500">
          <Archive className="h-3.5 w-3.5" strokeWidth={2.3} />
          Semanas cerradas
        </h2>

        {closedCycles.length === 0 ? (
          <Card className="p-5 text-center text-sm text-zinc-500">
            Aún no cierras ninguna semana.
          </Card>
        ) : (
          <ul className="space-y-2">
            {closedCycles.map((item) => {
              const isExpanded = expandedCycleId === item.id;
              const leftover = item.closedBalance ?? 0;

              return (
                <li key={item.id}>
                  <Card className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        play('tap');
                        setExpandedCycleId(isExpanded ? null : (item.id ?? null));
                      }}
                      className="flex w-full items-center justify-between gap-3 p-3.5 text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-200">
                          {formatDateRange(item.startDate, item.endDate)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-600">
                          Ingreso {formatCurrency(item.totalIncome, settings.currencySymbol)}
                          <span className="mx-1">·</span>
                          Gasolina {formatCurrency(item.gasReserve, settings.currencySymbol)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p
                          className={cn(
                            'text-sm font-bold tabular-nums',
                            leftover > 0 ? 'text-emerald-400' : 'text-zinc-500',
                          )}
                        >
                          {formatCurrency(leftover, settings.currencySymbol)}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-700">
                          sobrante
                        </p>
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-t border-zinc-800"
                        >
                          <ArchivedCycleDetail
                            cycle={item}
                            transactions={archivedTransactions}
                            currencySymbol={settings.currencySymbol}
                            reference={now}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function ArchivedCycleDetail({
  cycle,
  transactions,
  currencySymbol,
  reference,
}: {
  cycle: WeeklyCycle;
  transactions: Transaction[];
  currencySymbol: string;
  reference: Date;
}) {
  // Se evalúa al cierre de ese ciclo (no hoy) para que el resumen refleje cómo
  // terminó realmente esa semana.
  const snapshot = useMemo(() => {
    const end = parseTimestamp(cycle.endDate);
    return calculateBudget({
      cycle,
      transactions,
      referenceDate: end > reference ? reference : end,
      currencySymbol,
    });
  }, [cycle, transactions, currencySymbol, reference]);

  const byCategory = useMemo(() => {
    const totals = new Map<ExpenseCategory, number>();
    for (const item of transactions) {
      totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  if (transactions.length === 0) {
    return <p className="p-3.5 text-xs text-zinc-600">Esta semana no tuvo movimientos.</p>;
  }

  return (
    <div className="space-y-3 p-3.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-zinc-950/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">Gasto variable</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-200">
            {formatCurrency(snapshot.variableSpentTotal, currencySymbol)}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-950/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">Gasolina cargada</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-sky-400">
            {formatCurrency(snapshot.gas.spent, currencySymbol)}
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {byCategory.map(([category, total]) => (
          <li key={category} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 text-zinc-400">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[category] }}
              />
              {CATEGORY_LABELS[category]}
            </span>
            <span className="font-semibold tabular-nums text-zinc-500">
              {formatCurrency(total, currencySymbol)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

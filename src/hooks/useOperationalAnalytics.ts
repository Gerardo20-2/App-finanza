'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { db, getDailyLogsInRange, readDailyLogFields, type DailyLog, type Transaction } from '@/lib/db';
import {
  calcDailyMetrics,
  calcWeeklyAndMonthlyAggregates,
  dayDataFromCapture,
  type DailyMetrics,
  type IrdBreakdown,
  type MonthlyAggregates,
} from '@/lib/operationalAnalytics';
import { addDaysLocal, parseDateKey, parseTimestamp, roundCurrency, toDateKey } from '@/lib/utils';

export interface OperationalAnalyticsState {
  isReady: boolean;
  /** Métricas de cada día con captura, por `YYYY-MM-DD`. */
  metricsByDay: Map<string, DailyMetrics>;
  /** IRD de cada día, calificado contra los días de SU mes. */
  irdByDay: Map<string, IrdBreakdown>;
  /** Agregados del mes en curso. */
  month: MonthlyAggregates;
}

/**
 * Rango que hay que leer para que todo cuadre:
 * - desde el día 1 del mes más viejo que toque la semana ANTERIOR (WoW) o el
 *   ciclo activo (sus tarjetas necesitan el IRD de su propio mes);
 * - hasta el último día del mes en curso o el fin del ciclo, lo que sea mayor.
 */
function analysisWindow(now: Date, cycleStartKey: string | undefined, cycleEndKey: string | undefined) {
  const earliestNeeded = addDaysLocal(now, -14);
  const cycleStart = cycleStartKey ? parseDateKey(cycleStartKey) : now;
  const earliest = cycleStart < earliestNeeded ? cycleStart : earliestNeeded;
  const from = new Date(earliest.getFullYear(), earliest.getMonth(), 1);

  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const cycleEnd = cycleEndKey ? parseDateKey(cycleEndKey) : monthEnd;
  const to = cycleEnd > monthEnd ? cycleEnd : monthEnd;

  return { fromKey: toDateKey(from), toKey: toDateKey(to), from, toExclusive: addDaysLocal(to, 1) };
}

/**
 * Analítica operativa DiDi sobre IndexedDB. La gasolina de cada día sale de los
 * gastos `combustible` (de cualquier ciclo), así que el prorrateo siempre cuadra
 * con lo que descontó el presupuesto.
 */
export function useOperationalAnalytics({
  now,
  weekStartDay,
  cycleStartDate,
  cycleEndDate,
}: {
  now: Date;
  weekStartDay: number;
  cycleStartDate?: string;
  cycleEndDate?: string;
}): OperationalAnalyticsState {
  const todayKey = toDateKey(now);
  const range = useMemo(
    () => analysisWindow(parseDateKey(todayKey), cycleStartDate, cycleEndDate),
    [todayKey, cycleStartDate, cycleEndDate],
  );

  const logs = useLiveQuery<DailyLog[] | undefined, undefined>(
    () => getDailyLogsInRange(range.fromKey, range.toKey),
    [range.fromKey, range.toKey],
    undefined,
  );

  // `date` se guarda en UTC: se consulta con los bordes del rango convertidos
  // a ISO para no perder las cargas de la noche del último día.
  const gasTransactions = useLiveQuery<Transaction[] | undefined, undefined>(
    () =>
      db.transactions
        .where('date')
        .between(range.from.toISOString(), range.toExclusive.toISOString(), true, false)
        .filter((item) => item.category === 'combustible')
        .toArray(),
    [range.from.getTime(), range.toExclusive.getTime()],
    undefined,
  );

  const metricsByDay = useMemo(() => {
    const gasByDay = new Map<string, number>();
    for (const item of gasTransactions ?? []) {
      const key = toDateKey(parseTimestamp(item.date));
      gasByDay.set(key, roundCurrency((gasByDay.get(key) ?? 0) + item.amount));
    }

    const result = new Map<string, DailyMetrics>();
    for (const log of logs ?? []) {
      const data = dayDataFromCapture(log.dateKey, readDailyLogFields(log), gasByDay.get(log.dateKey) ?? 0);
      result.set(log.dateKey, calcDailyMetrics(data));
    }
    return result;
  }, [logs, gasTransactions]);

  const allDays = useMemo(() => [...metricsByDay.values()], [metricsByDay]);

  const month = useMemo(
    () => calcWeeklyAndMonthlyAggregates({ days: allDays, referenceDate: parseDateKey(todayKey), weekStartDay }),
    [allDays, todayKey, weekStartDay],
  );

  // Días de otros meses dentro de la ventana (p. ej. un ciclo que arrancó a
  // fin del mes pasado) se califican contra su propio mes.
  const irdByDay = useMemo(() => {
    const result = new Map(month.irdByDay);
    const otherMonths = new Set(
      allDays.map((day) => day.dateKey.slice(0, 7)).filter((key) => key !== month.month),
    );
    for (const key of otherMonths) {
      const aggregates = calcWeeklyAndMonthlyAggregates({
        days: allDays,
        referenceDate: parseDateKey(todayKey),
        weekStartDay,
        month: key,
      });
      for (const [dateKey, ird] of aggregates.irdByDay) result.set(dateKey, ird);
    }
    return result;
  }, [allDays, month, todayKey, weekStartDay]);

  return {
    isReady: logs !== undefined && gasTransactions !== undefined,
    metricsByDay,
    irdByDay,
    month,
  };
}

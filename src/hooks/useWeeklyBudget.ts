'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import {
  addTransaction as addTransactionRecord,
  bootstrap,
  closeCycle as closeCycleRecord,
  db,
  deleteTransaction as deleteTransactionRecord,
  DEFAULT_SETTINGS,
  ensureActiveCycle,
  getActiveCycle,
  readSettings,
  saveSettings as saveSettingsRecord,
  startNewCycle,
  updateCycle as updateCycleRecord,
  type StartCycleInput,
  type Transaction,
  type UserSettings,
  type WeeklyCycle,
} from '@/lib/db';
import {
  buildBurnSeries,
  calculateBudget,
  getCategoryTotals,
  getDailyUsage,
  type BudgetSnapshot,
  type BurnPoint,
  type DayUsage,
  type ExpenseCategory,
} from '@/lib/budgetEngine';

/**
 * Reloj de baja frecuencia. El cupo diario depende de la fecha actual, así que
 * la app debe re-renderizar sola al cruzar la medianoche sin que el usuario
 * recargue. Un minuto de resolución es de sobra y cuesta nada.
 */
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    const onFocus = () => setNow(new Date());

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [intervalMs]);

  return now;
}

export interface QuickExpenseInput {
  amount: number;
  category: ExpenseCategory;
  note?: string;
  isQuickTap?: boolean;
}

export interface WeeklyBudgetState {
  /** `false` hasta que IndexedDB respondió: evita parpadeos de datos vacíos. */
  isReady: boolean;
  settings: UserSettings;
  cycle: WeeklyCycle | undefined;
  transactions: Transaction[];
  todayTransactions: Transaction[];
  snapshot: BudgetSnapshot | null;
  dailyUsage: DayUsage[];
  burnSeries: BurnPoint[];
  categoryTotals: Array<{ category: ExpenseCategory; total: number; count: number }>;
  now: Date;
  addExpense: (input: QuickExpenseInput) => Promise<BudgetSnapshot | null>;
  removeExpense: (id: number) => Promise<void>;
  startCycle: (input?: StartCycleInput) => Promise<void>;
  closeCurrentCycle: () => Promise<void>;
  updateCycle: (patch: Partial<Omit<WeeklyCycle, 'id'>>) => Promise<void>;
  saveSettings: (patch: Partial<Omit<UserSettings, 'id'>>) => Promise<void>;
}

/**
 * Fuente única de verdad del dashboard.
 *
 * `useLiveQuery` suscribe el componente a IndexedDB: cualquier inserción —desde
 * esta pestaña o desde otra— vuelve a disparar la consulta y el cupo del día se
 * recalcula al instante, sin recargar la página ni manejar estado global.
 */
export function useWeeklyBudget(): WeeklyBudgetState {
  const now = useNow();

  // Siembra ajustes y primer ciclo UNA sola vez. Va en un efecto, no en un
  // `useLiveQuery`, porque las consultas reactivas de Dexie corren en una
  // transacción de sólo lectura y cualquier escritura ahí lanza `DexieError`.
  useEffect(() => {
    void bootstrap().catch(() => {
      /* Sin IndexedDB (modo privado antiguo) la UI se queda en el esqueleto. */
    });
  }, []);

  // A partir de aquí, todas las consultas son de SOLO LECTURA.
  // Se envuelven en un objeto para distinguir "aún cargando" (undefined) de
  // "cargado y no existe" ({ value: undefined }).
  const settingsQuery = useLiveQuery(async () => ({ value: await readSettings() }), [], undefined);

  const cycleQuery = useLiveQuery<{ value: WeeklyCycle | undefined } | undefined, undefined>(
    async () => ({ value: await getActiveCycle() }),
    [],
    undefined,
  );

  const cycle = cycleQuery?.value;
  const cycleId = cycle?.id;

  const transactionsQuery = useLiveQuery<{ value: Transaction[] } | undefined, undefined>(
    async () => ({
      value:
        cycleId === undefined
          ? []
          : await db.transactions.where('cycleId').equals(cycleId).toArray(),
    }),
    [cycleId],
    undefined,
  );

  const resolvedSettings = useMemo<UserSettings>(
    () => ({ ...DEFAULT_SETTINGS, ...(settingsQuery?.value ?? {}) }),
    [settingsQuery],
  );

  const resolvedTransactions = useMemo<Transaction[]>(
    () => transactionsQuery?.value ?? [],
    [transactionsQuery],
  );

  const isReady =
    settingsQuery !== undefined && cycleQuery !== undefined && transactionsQuery !== undefined;

  const snapshot = useMemo<BudgetSnapshot | null>(() => {
    if (!cycle) return null;
    return calculateBudget({
      cycle,
      transactions: resolvedTransactions,
      referenceDate: now,
      currencySymbol: resolvedSettings.currencySymbol,
    });
  }, [cycle, resolvedTransactions, now, resolvedSettings.currencySymbol]);

  const dailyUsage = useMemo<DayUsage[]>(() => {
    if (!cycle) return [];
    return getDailyUsage({ cycle, transactions: resolvedTransactions, referenceDate: now });
  }, [cycle, resolvedTransactions, now]);

  const burnSeries = useMemo<BurnPoint[]>(() => {
    if (!cycle) return [];
    return buildBurnSeries({ cycle, transactions: resolvedTransactions, referenceDate: now });
  }, [cycle, resolvedTransactions, now]);

  const categoryTotals = useMemo(
    () => getCategoryTotals(resolvedTransactions),
    [resolvedTransactions],
  );

  const todayTransactions = useMemo<Transaction[]>(() => {
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    return resolvedTransactions
      .filter((item) => item.date.slice(0, 10) === todayKey)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [resolvedTransactions, now]);

  /**
   * Registra el gasto y devuelve el snapshot PROYECTADO ya con ese gasto
   * dentro, para que quien llama decida el feedback (confeti vs. golpe sordo)
   * sin esperar el siguiente render de Dexie.
   */
  const addExpense = useCallback(
    async (input: QuickExpenseInput): Promise<BudgetSnapshot | null> => {
      const active = cycle ?? (await ensureActiveCycle(now));
      if (active.id === undefined) return null;

      await addTransactionRecord({
        cycleId: active.id,
        amount: input.amount,
        category: input.category,
        isQuickTap: input.isQuickTap ?? false,
        ...(input.note ? { note: input.note } : {}),
      });

      return calculateBudget({
        cycle: active,
        transactions: [
          ...resolvedTransactions,
          {
            amount: input.amount,
            category: input.category,
            date: new Date().toISOString(),
          },
        ],
        referenceDate: now,
        currencySymbol: resolvedSettings.currencySymbol,
      });
    },
    [cycle, now, resolvedTransactions, resolvedSettings.currencySymbol],
  );

  const removeExpense = useCallback(async (id: number) => {
    await deleteTransactionRecord(id);
  }, []);

  const startCycle = useCallback(
    async (input: StartCycleInput = {}) => {
      await startNewCycle({ reference: now, ...input });
    },
    [now],
  );

  const closeCurrentCycle = useCallback(async () => {
    if (!cycle?.id || !snapshot) return;
    await closeCycleRecord(cycle.id, snapshot.remainingBalance);
  }, [cycle?.id, snapshot]);

  const updateCycle = useCallback(
    async (patch: Partial<Omit<WeeklyCycle, 'id'>>) => {
      if (cycle?.id === undefined) return;
      await updateCycleRecord(cycle.id, patch);
    },
    [cycle?.id],
  );

  const saveSettings = useCallback(async (patch: Partial<Omit<UserSettings, 'id'>>) => {
    await saveSettingsRecord(patch);
  }, []);

  return {
    isReady,
    settings: resolvedSettings,
    cycle,
    transactions: resolvedTransactions,
    todayTransactions,
    snapshot,
    dailyUsage,
    burnSeries,
    categoryTotals,
    now,
    addExpense,
    removeExpense,
    startCycle,
    closeCurrentCycle,
    updateCycle,
    saveSettings,
  };
}

import Dexie, { type Table } from 'dexie';
import type { ExpenseCategory } from './budgetEngine';
import { CYCLE_LENGTH_DAYS } from './budgetEngine';
import { addDaysLocal, roundCurrency, safeNumber, startOfLocalDay, toDateKey } from './utils';

/* -------------------------------------------------------------------------- */
/*                                  Modelos                                   */
/* -------------------------------------------------------------------------- */

export interface WeeklyCycle {
  id?: number;
  startDate: string; // ISO string YYYY-MM-DD
  endDate: string; // ISO string YYYY-MM-DD
  totalIncome: number;
  gasReserve: number; // Monto apartado exclusivamente para gasolina
  status: 'active' | 'closed';
  /**
   * Compromisos fijos de la semana (renta prorrateada, datos, suscripciones).
   * Se descuentan antes de repartir el cupo diario, tal como exige la fórmula
   * `Presupuesto_Operativo`.
   */
  fixedExpenses: number;
  /** Saldo remanente congelado al cerrar el ciclo. */
  closedBalance?: number;
  closedAt?: string;
}

export interface Transaction {
  id?: number;
  cycleId: number;
  amount: number;
  category: ExpenseCategory;
  date: string; // ISO string con hora
  note?: string;
  isQuickTap: boolean; // True si fue registrado por botón de 1 toque
}

export interface UserSettings {
  id?: number;
  cycleStartDay: number; // 0 (Domingo) a 6 (Sábado)
  defaultWeeklyIncome: number;
  defaultGasReserve: number;
  defaultFixedExpenses: number;
  currencySymbol: string;
  hapticFeedback: boolean;
  soundFeedback: boolean;
}

export const SETTINGS_ID = 1;

export const DEFAULT_SETTINGS: Required<Omit<UserSettings, 'id'>> = {
  cycleStartDay: 5, // Viernes: día de pago más común para ingreso semanal
  defaultWeeklyIncome: 2500,
  defaultGasReserve: 500,
  defaultFixedExpenses: 0,
  currencySymbol: '$',
  hapticFeedback: true,
  soundFeedback: true,
};

/* -------------------------------------------------------------------------- */
/*                              Instancia Dexie                               */
/* -------------------------------------------------------------------------- */

export class WeeklyBurnDB extends Dexie {
  cycles!: Table<WeeklyCycle, number>;
  transactions!: Table<Transaction, number>;
  settings!: Table<UserSettings, number>;

  constructor() {
    super('weeklyburn');

    this.version(1).stores({
      cycles: '++id, startDate, endDate, status',
      transactions: '++id, cycleId, category, date, [cycleId+date], [cycleId+category]',
      settings: '++id',
    });
  }
}

/**
 * Dexie sólo toca IndexedDB al abrir la conexión, no al construirse, así que
 * esta instancia a nivel de módulo es segura durante el render en servidor de
 * Next.js. Toda lectura real ocurre dentro de componentes cliente.
 */
export const db = new WeeklyBurnDB();

/* -------------------------------------------------------------------------- */
/*                                 Settings                                   */
/* -------------------------------------------------------------------------- */

export async function getSettings(): Promise<UserSettings> {
  const stored = await db.settings.get(SETTINGS_ID);
  if (stored) return { ...DEFAULT_SETTINGS, ...stored };

  const seeded: UserSettings = { id: SETTINGS_ID, ...DEFAULT_SETTINGS };
  await db.settings.put(seeded);
  return seeded;
}

export async function saveSettings(patch: Partial<Omit<UserSettings, 'id'>>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: SETTINGS_ID });
}

/* -------------------------------------------------------------------------- */
/*                            Fechas del ciclo                                */
/* -------------------------------------------------------------------------- */

/**
 * Calcula el rango del ciclo de 7 días que contiene a `reference`, anclado al
 * día de pago configurado. Si hoy ES el día de pago, hoy abre el ciclo.
 */
export function resolveCycleRange(
  cycleStartDay: number,
  reference: Date = new Date(),
): { startDate: string; endDate: string } {
  const today = startOfLocalDay(reference);
  const targetDay = ((Math.round(safeNumber(cycleStartDay)) % 7) + 7) % 7;
  const backtrack = (today.getDay() - targetDay + 7) % 7;

  const start = addDaysLocal(today, -backtrack);
  const end = addDaysLocal(start, CYCLE_LENGTH_DAYS - 1);

  return { startDate: toDateKey(start), endDate: toDateKey(end) };
}

/* -------------------------------------------------------------------------- */
/*                                  Ciclos                                    */
/* -------------------------------------------------------------------------- */

export async function getActiveCycle(): Promise<WeeklyCycle | undefined> {
  return db.cycles.where('status').equals('active').last();
}

export interface StartCycleInput {
  startDate?: string;
  endDate?: string;
  totalIncome?: number;
  gasReserve?: number;
  fixedExpenses?: number;
  reference?: Date;
}

/**
 * Cierra cualquier ciclo activo y abre uno nuevo. Es idempotente por diseño:
 * siempre queda exactamente un ciclo `active`.
 */
export async function startNewCycle(input: StartCycleInput = {}): Promise<number> {
  const settings = await getSettings();
  const reference = input.reference ?? new Date();
  const range = resolveCycleRange(settings.cycleStartDay, reference);

  const cycle: Omit<WeeklyCycle, 'id'> = {
    startDate: input.startDate ?? range.startDate,
    endDate: input.endDate ?? range.endDate,
    totalIncome: Math.max(0, roundCurrency(safeNumber(input.totalIncome, settings.defaultWeeklyIncome))),
    gasReserve: Math.max(0, roundCurrency(safeNumber(input.gasReserve, settings.defaultGasReserve))),
    fixedExpenses: Math.max(
      0,
      roundCurrency(safeNumber(input.fixedExpenses, settings.defaultFixedExpenses)),
    ),
    status: 'active',
  };

  return db.transaction('rw', db.cycles, async () => {
    const open = await db.cycles.where('status').equals('active').toArray();
    for (const previous of open) {
      if (previous.id !== undefined) {
        await db.cycles.update(previous.id, {
          status: 'closed',
          closedAt: new Date().toISOString(),
        });
      }
    }
    return db.cycles.add(cycle as WeeklyCycle);
  });
}

/** Devuelve el ciclo activo, creando uno con los valores por defecto si falta. */
export async function ensureActiveCycle(reference: Date = new Date()): Promise<WeeklyCycle> {
  const existing = await getActiveCycle();
  if (existing) return existing;

  const id = await startNewCycle({ reference });
  const created = await db.cycles.get(id);
  if (!created) throw new Error('No se pudo crear el ciclo semanal.');
  return created;
}

export async function updateCycle(
  cycleId: number,
  patch: Partial<Omit<WeeklyCycle, 'id'>>,
): Promise<void> {
  await db.cycles.update(cycleId, patch);
}

/** Cierra el ciclo guardando su saldo final para el historial. */
export async function closeCycle(cycleId: number, closedBalance: number): Promise<void> {
  await db.cycles.update(cycleId, {
    status: 'closed',
    closedBalance: roundCurrency(closedBalance),
    closedAt: new Date().toISOString(),
  });
}

export async function getCycles(): Promise<WeeklyCycle[]> {
  const all = await db.cycles.toArray();
  return all.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/* -------------------------------------------------------------------------- */
/*                              Transacciones                                 */
/* -------------------------------------------------------------------------- */

export interface AddTransactionInput {
  cycleId: number;
  amount: number;
  category: ExpenseCategory;
  note?: string;
  isQuickTap?: boolean;
  date?: Date;
}

export async function addTransaction(input: AddTransactionInput): Promise<number> {
  const amount = Math.max(0, roundCurrency(safeNumber(input.amount)));
  if (amount <= 0) throw new Error('El monto debe ser mayor a cero.');

  const record: Omit<Transaction, 'id'> = {
    cycleId: input.cycleId,
    amount,
    category: input.category,
    date: (input.date ?? new Date()).toISOString(),
    isQuickTap: input.isQuickTap ?? false,
    ...(input.note ? { note: input.note.trim() } : {}),
  };

  return db.transactions.add(record as Transaction);
}

export async function deleteTransaction(id: number): Promise<void> {
  await db.transactions.delete(id);
}

export async function getTransactionsForCycle(cycleId: number): Promise<Transaction[]> {
  return db.transactions.where('cycleId').equals(cycleId).toArray();
}

/** Borra todo. Usado por el botón destructivo de Ajustes. */
export async function wipeAllData(): Promise<void> {
  await db.transaction('rw', db.cycles, db.transactions, db.settings, async () => {
    await db.transactions.clear();
    await db.cycles.clear();
    await db.settings.clear();
  });
}

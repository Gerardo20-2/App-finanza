/**
 * WeeklyBurn — motor financiero.
 *
 * Todo en este archivo es puro y determinista: mismas entradas -> mismas
 * salidas, sin acceso a IndexedDB, sin `Date.now()` implícito (la fecha de
 * referencia siempre se recibe como parámetro). Eso lo hace trivialmente
 * testeable y permite que la UI recalcule en cada render sin efectos raros.
 */

import {
  clamp,
  daysBetween,
  parseDateKey,
  parseTimestamp,
  roundCurrency,
  safeNumber,
  startOfLocalDay,
  toDateKey,
} from './utils';

export const CYCLE_LENGTH_DAYS = 7;

export type ExpenseCategory = 'comida' | 'combustible' | 'super' | 'gustos' | 'urgencia';

export type BudgetStatus = 'healthy' | 'caution' | 'critical' | 'survival';

/** Forma mínima que el motor necesita de una transacción. */
export interface EngineTransaction {
  amount: number;
  category: ExpenseCategory;
  date: string;
}

export interface EngineCycle {
  startDate: string;
  endDate: string;
  totalIncome: number;
  gasReserve: number;
  fixedExpenses?: number;
}

export interface CycleProgress {
  /** Días que dura el ciclo (inclusivo en ambos extremos). */
  totalDays: number;
  /** Día en curso, base 1. Se satura en `totalDays`. */
  dayIndex: number;
  /** Días completamente terminados antes de hoy. */
  daysElapsed: number;
  /** Días que faltan incluyendo el día en curso. 0 si el ciclo ya venció. */
  daysRemaining: number;
  /** Avance temporal del ciclo, 0..1. */
  percentComplete: number;
  isLastDay: boolean;
  /** La fecha de referencia es posterior a `endDate`. */
  isFinished: boolean;
  /** La fecha de referencia es anterior a `startDate`. */
  isPending: boolean;
  startDate: Date;
  endDate: Date;
}

export interface SurplusDistribution {
  /** Positivo = ahorro del día, negativo = sobregasto del día. */
  surplus: number;
  /** Días futuros entre los que se reparte (excluye hoy). */
  daysToSpread: number;
  /** Cuánto sube o baja el cupo de cada día futuro. */
  perDayDelta: number;
  /** Cupo proyectado para mañana si hoy se cierra con este saldo. */
  projectedNextAllowance: number;
}

export interface GasBreakdown {
  /** Monto apartado al abrir el ciclo. */
  reserve: number;
  /** Total gastado en categoría `combustible`. */
  spent: number;
  /** Lo que queda del tanque presupuestal, nunca negativo. */
  remaining: number;
  /** Gasolina gastada por encima de la reserva: esto sí golpea el cupo diario. */
  overflow: number;
  /** 0..1 del tanque consumido. */
  usedRatio: number;
}

export interface BudgetSnapshot {
  progress: CycleProgress;
  /** Ingreso - reserva de gasolina restante - gastos fijos. */
  operatingBudget: number;
  /** Saldo del ciclo después de TODO el gasto variable acumulado. */
  remainingBalance: number;
  /** Saldo con el que arrancó el día (no incluye el gasto de hoy). */
  balanceAtDayStart: number;
  /** Cupo máximo asignado al día en curso. */
  dailyAllowance: number;
  /** Gasto de hoy que efectivamente consume el cupo diario. */
  spentToday: number;
  /** Cupo menos gasto de hoy, saturado en 0. */
  availableToday: number;
  /** Cuánto se pasó hoy del cupo, saturado en 0. */
  overspentToday: number;
  /** `spentToday / dailyAllowance`, 0..1 (saturado). */
  usedRatio: number;
  /** `availableToday / dailyAllowance`, 0..1. Base del semáforo. */
  availableRatio: number;
  /** Gasto variable acumulado que consumió cupo en todo el ciclo. */
  variableSpentTotal: number;
  fixedExpenses: number;
  gas: GasBreakdown;
  /** Burn ideal: presupuesto operativo repartido plano entre los días. */
  idealDailyBurn: number;
  surplus: SurplusDistribution;
  status: BudgetStatus;
  /** Saldo agotado antes de terminar la semana. */
  isSurvivalMode: boolean;
  currencySymbol: string;
}

export interface BurnPoint {
  /** Día del ciclo, base 1. */
  day: number;
  label: string;
  dateKey: string;
  /** Línea ideal: consumo plano del presupuesto operativo. */
  ideal: number;
  /** Acumulado real. `null` para días que aún no ocurren. */
  actual: number | null;
  /** Gasto del día aislado. `null` para días futuros. */
  daily: number | null;
  isToday: boolean;
  isFuture: boolean;
}

export interface DayUsage {
  dateKey: string;
  date: Date;
  day: number;
  spent: number;
  isToday: boolean;
  isFuture: boolean;
  isPast: boolean;
}

/* -------------------------------------------------------------------------- */
/*                          A. Progreso del ciclo                             */
/* -------------------------------------------------------------------------- */

/**
 * Ubica la fecha de referencia dentro del ciclo.
 *
 * Satura `dayIndex` en `[1, totalDays]` para que un ciclo vencido o aún no
 * iniciado nunca produzca índices negativos ni divisores en cero aguas abajo.
 */
export function getWeekProgress(
  cycle: Pick<EngineCycle, 'startDate' | 'endDate'>,
  referenceDate: Date = new Date(),
): CycleProgress {
  const start = parseDateKey(cycle.startDate);
  const end = parseDateKey(cycle.endDate);
  const today = startOfLocalDay(referenceDate);

  const span = daysBetween(start, end) + 1;
  const totalDays = span > 0 ? span : CYCLE_LENGTH_DAYS;

  const rawIndex = daysBetween(start, today) + 1;
  const isPending = rawIndex < 1;
  const isFinished = rawIndex > totalDays;
  const dayIndex = clamp(rawIndex, 1, totalDays);
  const daysElapsed = dayIndex - 1;
  const daysRemaining = isFinished ? 0 : totalDays - daysElapsed;

  return {
    totalDays,
    dayIndex,
    daysElapsed,
    daysRemaining,
    percentComplete: clamp(dayIndex / totalDays, 0, 1),
    isLastDay: !isFinished && daysRemaining === 1,
    isFinished,
    isPending,
    startDate: start,
    endDate: end,
  };
}

/* -------------------------------------------------------------------------- */
/*                        B. Asignación diaria (burn rate)                    */
/* -------------------------------------------------------------------------- */

/**
 * Cupo del día = saldo restante / días restantes.
 *
 * Blindajes obligatorios:
 * - `daysRemaining <= 0` (último día ya consumido o ciclo vencido) usa 1 como
 *   divisor, así el último día siempre recibe el saldo completo en vez de
 *   dividir entre cero.
 * - entradas no finitas se degradan a 0 en lugar de propagar `NaN`.
 * - saldo negativo devuelve 0: no existe el cupo negativo, eso es Modo
 *   Supervivencia.
 */
export function calculateDailyAllowance(remainingBalance: number, daysRemaining: number): number {
  const balance = safeNumber(remainingBalance);
  if (balance <= 0) return 0;

  const rawDays = safeNumber(daysRemaining);
  const divisor = rawDays >= 1 ? Math.floor(rawDays) : 1;

  return roundCurrency(balance / divisor);
}

/**
 * Reparte el sobrante (o el sobregasto) del día entre los días que faltan.
 *
 * Subgasto: cupo 180, gastado 100 -> +80 repartidos entre los días restantes.
 * Sobregasto: cupo 180, gastado 250 -> -70 repartidos entre los días restantes.
 * Último día (`daysToSpread === 0`): no hay a quién repartirle, el delta es 0 y
 * el sobrante queda como ahorro del ciclo.
 */
export function distributeSurplus(
  dailyAllowance: number,
  spentToday: number,
  daysRemainingAfterToday: number,
): SurplusDistribution {
  const allowance = Math.max(0, safeNumber(dailyAllowance));
  const spent = Math.max(0, safeNumber(spentToday));
  const surplus = roundCurrency(allowance - spent);

  const rawDays = Math.floor(safeNumber(daysRemainingAfterToday));
  const daysToSpread = rawDays > 0 ? rawDays : 0;

  if (daysToSpread === 0) {
    return { surplus, daysToSpread: 0, perDayDelta: 0, projectedNextAllowance: 0 };
  }

  const perDayDelta = roundCurrency(surplus / daysToSpread);
  const projectedNextAllowance = Math.max(0, roundCurrency(allowance + perDayDelta));

  return { surplus, daysToSpread, perDayDelta, projectedNextAllowance };
}

/* -------------------------------------------------------------------------- */
/*                       C. Atribución de gasto a cupo                        */
/* -------------------------------------------------------------------------- */

/**
 * Cuánto del importe de cada transacción consume realmente el cupo diario.
 *
 * La gasolina se cobra contra la reserva apartada mientras alcance; sólo el
 * excedente por encima de la reserva golpea el cupo de comida. Se recorre en
 * orden cronológico para que la atribución sea estable e idéntica en cada
 * recálculo.
 */
export function chargeableAmounts(
  transactions: readonly EngineTransaction[],
  gasReserve: number,
): { charges: number[]; gasSpent: number; gasOverflow: number } {
  const reserve = Math.max(0, safeNumber(gasReserve));
  const ordered = [...transactions].sort(
    (a, b) => parseTimestamp(a.date).getTime() - parseTimestamp(b.date).getTime(),
  );

  const charges: number[] = [];
  let gasCumulative = 0;

  for (const tx of ordered) {
    const amount = Math.max(0, roundCurrency(safeNumber(tx.amount)));

    if (tx.category === 'combustible') {
      const overflowBefore = Math.max(0, gasCumulative - reserve);
      gasCumulative = roundCurrency(gasCumulative + amount);
      const overflowAfter = Math.max(0, gasCumulative - reserve);
      charges.push(roundCurrency(overflowAfter - overflowBefore));
    } else {
      charges.push(amount);
    }
  }

  return {
    charges,
    gasSpent: roundCurrency(gasCumulative),
    gasOverflow: roundCurrency(Math.max(0, gasCumulative - reserve)),
  };
}

/** Igual que `chargeableAmounts` pero conservando la transacción original. */
function chargedTransactions(
  transactions: readonly EngineTransaction[],
  gasReserve: number,
): { items: Array<{ tx: EngineTransaction; charge: number }>; gasSpent: number; gasOverflow: number } {
  const ordered = [...transactions].sort(
    (a, b) => parseTimestamp(a.date).getTime() - parseTimestamp(b.date).getTime(),
  );
  const { charges, gasSpent, gasOverflow } = chargeableAmounts(ordered, gasReserve);

  return {
    items: ordered.map((tx, index) => ({ tx, charge: charges[index] ?? 0 })),
    gasSpent,
    gasOverflow,
  };
}

/* -------------------------------------------------------------------------- */
/*                            D. Semáforo de estado                           */
/* -------------------------------------------------------------------------- */

export function resolveStatus(availableRatio: number, isSurvivalMode: boolean): BudgetStatus {
  if (isSurvivalMode) return 'survival';
  const ratio = clamp(availableRatio, 0, 1);
  if (ratio <= 0) return 'survival';
  if (ratio > 0.5) return 'healthy';
  if (ratio > 0.2) return 'caution';
  return 'critical';
}

export const STATUS_META: Record<
  BudgetStatus,
  { label: string; tone: string; ring: string; text: string; dot: string }
> = {
  healthy: {
    label: 'En control',
    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    ring: '#34d399',
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
  },
  caution: {
    label: 'Ajustado',
    tone: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    ring: '#fbbf24',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
  },
  critical: {
    label: 'Al límite',
    tone: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    ring: '#f43f5e',
    text: 'text-rose-500',
    dot: 'bg-rose-500',
  },
  survival: {
    label: 'Supervivencia',
    tone: 'border-rose-500/40 bg-rose-500/15 text-rose-200',
    ring: '#f43f5e',
    text: 'text-rose-400',
    dot: 'bg-rose-500',
  },
};

/* -------------------------------------------------------------------------- */
/*                          E. Cálculo integral                               */
/* -------------------------------------------------------------------------- */

export interface BudgetInput {
  cycle: EngineCycle;
  transactions: readonly EngineTransaction[];
  referenceDate?: Date;
  currencySymbol?: string;
}

/**
 * Snapshot completo del presupuesto en un instante dado.
 *
 * Orden de operaciones (sección 3.B del brief):
 *   1. Presupuesto_Operativo = Ingreso - Reserva_Gasolina_Restante - Gastos_Fijos
 *   2. Saldo_Restante        = Presupuesto_Operativo - Gastos_Variables_Acumulados
 *   3. Cupo_Hoy              = Saldo_al_inicio_del_día / Días_Restantes
 *
 * El cupo se fija con el saldo al ARRANQUE del día: gastar hoy no encoge el
 * cupo de hoy (se ve drenar la barra), sino el de los días siguientes. Eso es
 * exactamente la dinámica de castigo/recompensa de la sección 3.C.
 */
export function calculateBudget(input: BudgetInput): BudgetSnapshot {
  const { cycle, transactions } = input;
  const referenceDate = input.referenceDate ?? new Date();
  const currencySymbol = input.currencySymbol ?? '$';

  const progress = getWeekProgress(cycle, referenceDate);
  const todayKey = toDateKey(startOfLocalDay(referenceDate));

  const totalIncome = Math.max(0, safeNumber(cycle.totalIncome));
  const gasReserveTotal = clamp(safeNumber(cycle.gasReserve), 0, totalIncome);
  const fixedExpenses = clamp(safeNumber(cycle.fixedExpenses), 0, totalIncome);

  const { items, gasSpent, gasOverflow } = chargedTransactions(transactions, gasReserveTotal);
  const gasRemaining = Math.max(0, roundCurrency(gasReserveTotal - gasSpent));

  // Paso 1. La reserva se aparta COMPLETA durante todo el ciclo y el gasto de
  // gasolina sólo consume cupo cuando rebasa esa reserva (ver
  // `chargeableAmounts`). Es algebraicamente idéntico a la formulación
  // `Ingreso - Reserva_Restante - Fijos` con la gasolina contada íntegra dentro
  // del gasto variable —
  //
  //   I - (R - G) - F - (V + G)  ==  I - R - F - V
  //
  // — pero deja el presupuesto operativo estable toda la semana en vez de
  // brincar cada vez que se carga gasolina, que es justo lo que pide el
  // requisito "descuenta de la reserva, no del cupo de comida".
  const operatingBudget = roundCurrency(totalIncome - gasReserveTotal - fixedExpenses);

  let chargedBeforeToday = 0;
  let chargedToday = 0;
  let chargedAfterToday = 0;

  for (const { tx, charge } of items) {
    const key = toDateKey(parseTimestamp(tx.date));
    if (key < todayKey) chargedBeforeToday += charge;
    else if (key > todayKey) chargedAfterToday += charge;
    else chargedToday += charge;
  }

  chargedBeforeToday = roundCurrency(chargedBeforeToday);
  chargedToday = roundCurrency(chargedToday);
  chargedAfterToday = roundCurrency(chargedAfterToday);

  const variableSpentTotal = roundCurrency(
    chargedBeforeToday + chargedToday + chargedAfterToday,
  );

  // Paso 2.
  const remainingBalance = roundCurrency(operatingBudget - variableSpentTotal);
  // Gastos futuros ya comprometidos también salen del saldo con el que abre hoy.
  const balanceAtDayStart = roundCurrency(
    operatingBudget - chargedBeforeToday - chargedAfterToday,
  );

  // Paso 3. Un ciclo vencido no reparte cupo: la UI pide cerrarlo.
  const dailyAllowance = progress.isFinished
    ? 0
    : calculateDailyAllowance(balanceAtDayStart, progress.daysRemaining);

  const spentToday = chargedToday;
  const availableToday = Math.max(0, roundCurrency(dailyAllowance - spentToday));
  const overspentToday = Math.max(0, roundCurrency(spentToday - dailyAllowance));

  const usedRatio = dailyAllowance > 0 ? clamp(spentToday / dailyAllowance, 0, 1) : spentToday > 0 ? 1 : 0;
  const availableRatio = dailyAllowance > 0 ? clamp(availableToday / dailyAllowance, 0, 1) : 0;

  const isSurvivalMode = remainingBalance <= 0 && !progress.isFinished;
  const status = resolveStatus(availableRatio, isSurvivalMode);

  const surplus = distributeSurplus(
    dailyAllowance,
    spentToday,
    Math.max(0, progress.daysRemaining - 1),
  );

  const idealDailyBurn = roundCurrency(operatingBudget / Math.max(1, progress.totalDays));

  return {
    progress,
    operatingBudget,
    remainingBalance,
    balanceAtDayStart,
    dailyAllowance,
    spentToday,
    availableToday,
    overspentToday,
    usedRatio,
    availableRatio,
    variableSpentTotal,
    fixedExpenses,
    gas: {
      reserve: gasReserveTotal,
      spent: gasSpent,
      remaining: gasRemaining,
      overflow: gasOverflow,
      usedRatio: gasReserveTotal > 0 ? clamp(gasSpent / gasReserveTotal, 0, 1) : gasSpent > 0 ? 1 : 0,
    },
    idealDailyBurn,
    surplus,
    status,
    isSurvivalMode,
    currencySymbol,
  };
}

/* -------------------------------------------------------------------------- */
/*                        F. Series para analítica                            */
/* -------------------------------------------------------------------------- */

/** Gasto que consume cupo, agrupado por día del ciclo. */
export function getDailyUsage(input: BudgetInput): DayUsage[] {
  const { cycle, transactions } = input;
  const referenceDate = input.referenceDate ?? new Date();
  const progress = getWeekProgress(cycle, referenceDate);
  const todayKey = toDateKey(startOfLocalDay(referenceDate));

  const gasReserve = Math.max(0, safeNumber(cycle.gasReserve));
  const { items } = chargedTransactions(transactions, gasReserve);

  const perDay = new Map<string, number>();
  for (const { tx, charge } of items) {
    const key = toDateKey(parseTimestamp(tx.date));
    perDay.set(key, roundCurrency((perDay.get(key) ?? 0) + charge));
  }

  const days: DayUsage[] = [];
  for (let offset = 0; offset < progress.totalDays; offset += 1) {
    const date = new Date(
      progress.startDate.getFullYear(),
      progress.startDate.getMonth(),
      progress.startDate.getDate() + offset,
    );
    const dateKey = toDateKey(date);
    days.push({
      dateKey,
      date,
      day: offset + 1,
      spent: perDay.get(dateKey) ?? 0,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
      isPast: dateKey < todayKey,
    });
  }

  return days;
}

/** Curva de quema real vs. ideal para el gráfico de analítica. */
export function buildBurnSeries(input: BudgetInput): BurnPoint[] {
  const snapshot = calculateBudget(input);
  const usage = getDailyUsage(input);
  const { operatingBudget, progress } = snapshot;

  let cumulative = 0;

  return usage.map((day) => {
    if (!day.isFuture) cumulative = roundCurrency(cumulative + day.spent);

    return {
      day: day.day,
      label: `D${day.day}`,
      dateKey: day.dateKey,
      ideal: roundCurrency((operatingBudget / Math.max(1, progress.totalDays)) * day.day),
      actual: day.isFuture ? null : cumulative,
      daily: day.isFuture ? null : day.spent,
      isToday: day.isToday,
      isFuture: day.isFuture,
    };
  });
}

/** Totales por categoría, ordenados de mayor a menor. */
export function getCategoryTotals(
  transactions: readonly EngineTransaction[],
): Array<{ category: ExpenseCategory; total: number; count: number }> {
  const totals = new Map<ExpenseCategory, { total: number; count: number }>();

  for (const tx of transactions) {
    const amount = Math.max(0, roundCurrency(safeNumber(tx.amount)));
    const current = totals.get(tx.category) ?? { total: 0, count: 0 };
    totals.set(tx.category, {
      total: roundCurrency(current.total + amount),
      count: current.count + 1,
    });
  }

  return [...totals.entries()]
    .map(([category, value]) => ({ category, ...value }))
    .sort((a, b) => b.total - a.total);
}

/* -------------------------------------------------------------------------- */
/*                        G. Modo Supervivencia                               */
/* -------------------------------------------------------------------------- */

export interface SurvivalMeal {
  name: string;
  cost: number;
  hint: string;
}

/** Sugerencias de ultra bajo costo para cuando el saldo llega a cero. */
export const SURVIVAL_MEALS: readonly SurvivalMeal[] = [
  { name: 'Huevo con frijoles', cost: 18, hint: '2 huevos + frijol de lata, rinde 2 comidas' },
  { name: 'Arroz + atún', cost: 25, hint: 'Bolsa de arroz + lata, alcanza para 3 días' },
  { name: 'Pasta con jitomate', cost: 22, hint: 'Espagueti 500 g + puré, 4 porciones' },
  { name: 'Sopa instantánea + huevo', cost: 15, hint: 'Súbele proteína por $8' },
  { name: 'Quesadillas de tortilla', cost: 20, hint: 'Kilo de tortilla + queso económico' },
  { name: 'Avena con plátano', cost: 12, hint: 'Desayuno que aguanta hasta la tarde' },
] as const;

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  comida: 'Comida',
  combustible: 'Combustible',
  super: 'Súper',
  gustos: 'Gustos',
  urgencia: 'Urgencia',
};

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  comida: '#34d399',
  combustible: '#38bdf8',
  super: '#a78bfa',
  gustos: '#fbbf24',
  urgencia: '#f43f5e',
};

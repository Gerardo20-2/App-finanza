/**
 * WeeklyBurn — motor de analítica operativa DiDi.
 *
 * Igual que `budgetEngine.ts`, todo aquí es puro: sin IndexedDB, sin React y
 * sin reloj implícito (la fecha de referencia siempre entra como parámetro).
 * Cruza lo que reporta el tablero de DiDi (distancia, duración conectada,
 * tiempo activo, viajes, ingreso) con el odómetro y la gasolina del día.
 *
 * Nada de esto alimenta al motor financiero: el ingreso DiDi y el prorrateo
 * son informativos y no cambian el cupo ni el saldo del ciclo.
 *
 * Convenciones:
 * - Las razones (`etaKm`, `etaTiempo`) van en 0..1; la UI las muestra en %.
 * - Un dato faltante o imposible de calcular es `null`, nunca `NaN`, `0`
 *   inventado ni `Infinity`.
 */

import {
  addDaysLocal,
  clamp,
  parseDateKey,
  roundCurrency,
  safeNumber,
  startOfLocalDay,
  toDateKey,
  WEEKDAY_NAMES,
} from './utils';

/* -------------------------------------------------------------------------- */
/*                               Captura / parseo                             */
/* -------------------------------------------------------------------------- */

/** Número finito y no negativo, o `null` si el campo está vacío o es basura. */
export function parseNonNegative(raw: string | undefined): number | null {
  const trimmed = (raw ?? '').trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Por debajo de este valor un número suelto se lee como horas (`8.5`); por
 * encima, como minutos (`510`). Nadie se conecta más de 24 h seguidas.
 */
const BARE_NUMBER_HOURS_LIMIT = 24;

/**
 * Convierte una duración a MINUTOS. Acepta lo que muestra el tablero de DiDi y
 * lo que es natural teclear:
 *
 *   `8:30`  ·  `8 h 30 min`  ·  `8h30m`  ·  `8.5 h`  ·  `510 min`  ·  `8.5`  ·  `510`
 *
 * Un número sin unidad ≤ 24 son horas; mayor a 24, minutos.
 */
export function parseDurationMinutes(raw: string | undefined): number | null {
  const trimmed = (raw ?? '').trim().toLowerCase().replace(',', '.');
  if (trimmed === '') return null;

  const clock = /^(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  if (clock) {
    const minutes = Number(clock[2]);
    if (minutes >= 60) return null;
    return Number(clock[1]) * 60 + minutes;
  }

  const units = /^(?:(\d+(?:\.\d+)?)\s*h(?:rs?|oras?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:utos?)?)?)?$/.exec(
    trimmed,
  );
  if (units && (units[1] !== undefined || units[2] !== undefined)) {
    return Number(units[1] ?? 0) * 60 + Number(units[2] ?? 0);
  }

  const bare = parseNonNegative(trimmed);
  if (bare === null) return null;
  return bare <= BARE_NUMBER_HOURS_LIMIT ? bare * 60 : bare;
}

/** Cantidad entera de viajes, o `null`. */
export function parseTripCount(raw: string | undefined): number | null {
  const parsed = parseNonNegative(raw);
  if (parsed === null || !Number.isInteger(parsed)) return null;
  return parsed;
}

/* -------------------------------------------------------------------------- */
/*                              Métricas diarias                              */
/* -------------------------------------------------------------------------- */

export interface DayData {
  dateKey: string;
  /** Ingreso DiDi del día. */
  ingreso: number | null;
  /** Gasolina cargada ese día (suma de la categoría `combustible`). */
  gasolina: number;
  kmInicio: number | null;
  kmFin: number | null;
  kmDidi: number | null;
  /** Duración total conectado, en minutos. */
  minConectado: number | null;
  /** Tiempo activo en viaje o recogida, en minutos. */
  minActivo: number | null;
  numViajes: number | null;
}

/** Lo que el usuario teclea en la tarjeta, tal cual (texto). */
export interface DayCapture {
  kmInicio: string;
  kmFin: string;
  kmDidi: string;
  horasConectado: string;
  tiempoActivo: string;
  numViajes: string;
  ingresoDidi: string;
}

/** Interpreta la captura cruda de un día. Un campo inválido cuenta como vacío. */
export function dayDataFromCapture(
  dateKey: string,
  capture: DayCapture,
  gasolina: number,
): DayData {
  return {
    dateKey,
    ingreso: parseNonNegative(capture.ingresoDidi),
    gasolina,
    kmInicio: parseNonNegative(capture.kmInicio),
    kmFin: parseNonNegative(capture.kmFin),
    kmDidi: parseNonNegative(capture.kmDidi),
    minConectado: parseDurationMinutes(capture.horasConectado),
    minActivo: parseDurationMinutes(capture.tiempoActivo),
    numViajes: parseTripCount(capture.numViajes),
  };
}

export interface DailyMetrics {
  dateKey: string;
  ingreso: number | null;
  gasolina: number;
  /** `km_fin - km_inicio`. Negativo si el odómetro se capturó al revés. */
  kmTotal: number | null;
  /** Km DiDi validados (no superan el total). */
  kmDidi: number | null;
  /** Km personales o "fantasma": `kmTotal - kmDidi`. */
  kmMuertos: number | null;
  /** η_km = km_didi / km_total, 0..1. */
  etaKm: number | null;
  /** η_t = tiempo_activo / tiempo_conectado, 0..1. */
  etaTiempo: number | null;
  /** G_DiDi = gasolina · η_km. */
  gasDidi: number | null;
  gasPersonal: number | null;
  /** MN = ingreso − G_DiDi. */
  margenNeto: number | null;
  /** R_km = MN / km_didi. */
  rKm: number | null;
  /** R_hr = MN / horas conectado. */
  rHora: number | null;
  /** EPV = ingreso / viajes. */
  epv: number | null;
  /** Ingreso / km_didi, antes de gasolina. */
  brutoKm: number | null;
  /** Ingreso / horas conectado, antes de gasolina. */
  brutoHora: number | null;
  /** Gasolina / km_total: lo que realmente cuesta mover el coche. */
  costoGasKm: number | null;
  horasConectado: number | null;
  minConectado: number | null;
  minActivo: number | null;
  numViajes: number | null;
  odometroInvalido: boolean;
  didiExcedeTotal: boolean;
  activoExcedeConectado: boolean;
}

/** Redondeo a 2 decimales (dinero y tarifas). */
const round2 = roundCurrency;

/** Redondeo a 4 decimales para razones 0..1 (dos decimales de porcentaje). */
function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

/** Divide sin producir `NaN` ni `Infinity`: sin divisor positivo -> `null`. */
function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

function roundOrNull(value: number | null, round: (v: number) => number = round2): number | null {
  return value === null ? null : round(value);
}

export function calcDailyMetrics(day: DayData): DailyMetrics {
  const gasolina = Math.max(0, safeNumber(day.gasolina));
  const { kmInicio, kmFin, minConectado, minActivo, numViajes, ingreso } = day;

  const kmTotal = kmInicio !== null && kmFin !== null ? round2(kmFin - kmInicio) : null;
  const odometroInvalido = kmTotal !== null && kmTotal < 0;
  const didiExcedeTotal =
    kmTotal !== null && !odometroInvalido && day.kmDidi !== null && day.kmDidi > kmTotal;

  // Sólo se reparte cuando el odómetro tiene sentido y DiDi cabe dentro de él.
  const canSplit = kmTotal !== null && kmTotal > 0 && day.kmDidi !== null && !didiExcedeTotal;
  const kmDidi = canSplit ? day.kmDidi : null;
  const etaKm = canSplit ? ratio(day.kmDidi, kmTotal) : null;

  const activoExcedeConectado =
    minActivo !== null && minConectado !== null && minActivo > minConectado;
  const etaTiempo = activoExcedeConectado ? null : ratio(minActivo, minConectado);

  // Sin gasolina cargada el prorrateo es cero aunque falte el odómetro; con
  // gasolina, hace falta η_km para saber qué parte le toca a DiDi.
  const gasDidi = gasolina === 0 ? 0 : etaKm !== null ? gasolina * etaKm : null;
  const gasPersonal = gasolina === 0 ? 0 : etaKm !== null ? gasolina * (1 - etaKm) : null;

  const margenNeto = ingreso !== null && gasDidi !== null ? ingreso - gasDidi : null;
  const horasConectado = minConectado !== null ? minConectado / 60 : null;

  // R_km usa los km que DiDi reporta aunque el odómetro falte: es la tarifa
  // por km de servicio. Si DiDi excede al odómetro, ese dato no es confiable.
  const kmDidiForRates = didiExcedeTotal ? null : day.kmDidi;

  return {
    dateKey: day.dateKey,
    ingreso,
    gasolina,
    kmTotal,
    kmDidi: roundOrNull(kmDidi),
    kmMuertos: canSplit && kmDidi !== null ? round2(kmTotal - kmDidi) : null,
    etaKm: roundOrNull(etaKm, round4),
    etaTiempo: roundOrNull(etaTiempo, round4),
    gasDidi: roundOrNull(gasDidi),
    gasPersonal: roundOrNull(gasPersonal),
    margenNeto: roundOrNull(margenNeto),
    rKm: roundOrNull(ratio(margenNeto, kmDidiForRates)),
    rHora: roundOrNull(ratio(margenNeto, horasConectado)),
    epv: roundOrNull(ratio(ingreso, numViajes)),
    brutoKm: roundOrNull(ratio(ingreso, kmDidiForRates)),
    brutoHora: roundOrNull(ratio(ingreso, horasConectado)),
    costoGasKm: odometroInvalido ? null : roundOrNull(ratio(gasolina, kmTotal)),
    horasConectado: roundOrNull(horasConectado),
    minConectado,
    minActivo,
    numViajes,
    odometroInvalido,
    didiExcedeTotal,
    activoExcedeConectado,
  };
}

/* -------------------------------------------------------------------------- */
/*                   Índice de Rendimiento Diario (IRD, 0-100)                */
/* -------------------------------------------------------------------------- */

export const IRD_WEIGHTS = {
  rKm: 0.4,
  rHora: 0.35,
  etaTiempo: 0.15,
  etaKm: 0.1,
} as const;

export interface IrdBreakdown {
  /** 0..100, entero. */
  score: number;
  /** Cada componente normalizado a 0..1, antes de ponderar. */
  rKmNorm: number;
  rHoraNorm: number;
  etaTiempo: number;
  etaKm: number;
}

type ScorableMetrics = DailyMetrics & {
  rKm: number;
  rHora: number;
  etaTiempo: number;
  etaKm: number;
};

/** El IRD necesita los cuatro componentes; un día incompleto no se califica. */
export function isScorable(day: DailyMetrics): day is ScorableMetrics {
  return day.rKm !== null && day.rHora !== null && day.etaTiempo !== null && day.etaKm !== null;
}

/**
 * Normaliza contra el MEJOR día del conjunto (`valor / máximo`, saturado a
 * 0..1) en vez de min-max. Con min-max el peor día siempre saca 0 aunque haya
 * sido bueno, y un solo día registrado dividiría entre cero. Aquí el mejor día
 * vale 1, un día con margen negativo vale 0 y los demás quedan proporcionales.
 */
function normalizeToBest(value: number, best: number): number {
  if (best <= 0) return 0;
  return clamp(value / best, 0, 1);
}

export function calcIRD(day: DailyMetrics, allDays: DailyMetrics[]): IrdBreakdown | null {
  if (!isScorable(day)) return null;

  const pool = allDays.filter(isScorable);
  const bestRKm = Math.max(day.rKm, ...pool.map((item) => item.rKm));
  const bestRHora = Math.max(day.rHora, ...pool.map((item) => item.rHora));

  const rKmNorm = normalizeToBest(day.rKm, bestRKm);
  const rHoraNorm = normalizeToBest(day.rHora, bestRHora);
  const etaTiempo = clamp(day.etaTiempo, 0, 1);
  const etaKm = clamp(day.etaKm, 0, 1);

  const weighted =
    rKmNorm * IRD_WEIGHTS.rKm +
    rHoraNorm * IRD_WEIGHTS.rHora +
    etaTiempo * IRD_WEIGHTS.etaTiempo +
    etaKm * IRD_WEIGHTS.etaKm;

  return {
    score: Math.round(clamp(weighted * 100, 0, 100)),
    rKmNorm: round4(rKmNorm),
    rHoraNorm: round4(rHoraNorm),
    etaTiempo,
    etaKm,
  };
}

/* -------------------------------------------------------------------------- */
/*                        Agregados semanales y mensuales                     */
/* -------------------------------------------------------------------------- */

export interface WeekdayProfileRow {
  /** 0 (Domingo) a 6 (Sábado), como `Date#getDay`. */
  weekday: number;
  label: string;
  /** Días con datos suficientes que entraron al promedio. */
  days: number;
  avgRKm: number | null;
  avgRHora: number | null;
  /** Promedio de km muertos / km totales, 0..1. */
  avgDeadKmRatio: number | null;
}

export interface WeekTotals {
  from: string;
  to: string;
  margenNeto: number;
  /** Σ margen / Σ km DiDi (ponderado por km, no promedio de razones). */
  rKm: number | null;
  days: number;
}

export interface WeekOverWeek {
  current: WeekTotals;
  previous: WeekTotals;
  /** Variación porcentual; `null` si la semana anterior no tiene base. */
  margenNetoPct: number | null;
  rKmPct: number | null;
}

export interface StarDay {
  metrics: DailyMetrics;
  ird: IrdBreakdown;
}

export interface MonthlyAggregates {
  /** `YYYY-MM`. */
  month: string;
  /** Días del mes con algún dato capturado. */
  days: DailyMetrics[];
  /** IRD de cada día del mes, calificado contra el resto del mes. */
  irdByDay: Map<string, IrdBreakdown>;
  starDay: StarDay | null;
  fleet: {
    /** Σ km DiDi / Σ km totales del mes. */
    etaKm: number | null;
    /** Σ tiempo activo / Σ tiempo conectado del mes (en minutos). */
    etaTiempo: number | null;
    kmDidi: number;
    kmTotal: number;
  };
  /** Lunes a domingo. */
  weekdayProfile: WeekdayProfileRow[];
  /** Día de la semana con el mayor R_hr promedio. */
  bestRHoraWeekday: WeekdayProfileRow | null;
  /** Día de la semana con la mayor proporción de km muertos. */
  worstDeadKmWeekday: WeekdayProfileRow | null;
  weekOverWeek: WeekOverWeek;
}

/** Orden lunes → domingo en índices de `Date#getDay`. */
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** `(actual − anterior) / |anterior| · 100`. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

function sumWeek(days: DailyMetrics[], from: Date, to: Date): WeekTotals {
  const fromKey = toDateKey(from);
  const toKey = toDateKey(to);
  const inRange = days.filter((day) => day.dateKey >= fromKey && day.dateKey <= toKey);

  let margenNeto = 0;
  let margenForKm = 0;
  let kmDidi = 0;
  let counted = 0;
  for (const day of inRange) {
    if (day.margenNeto === null) continue;
    counted += 1;
    margenNeto += day.margenNeto;
    if (day.kmDidi !== null && day.kmDidi > 0) {
      margenForKm += day.margenNeto;
      kmDidi += day.kmDidi;
    }
  }

  return {
    from: fromKey,
    to: toKey,
    margenNeto: round2(margenNeto),
    rKm: kmDidi > 0 ? round2(margenForKm / kmDidi) : null,
    days: counted,
  };
}

/**
 * WoW comparando la semana en curso CONTRA LOS MISMOS DÍAS de la anterior
 * (si hoy es el día 3 de la semana, se comparan 3 días contra 3 días). Una
 * semana a medias contra una completa siempre saldría "peor" sin serlo.
 *
 * Por la misma razón, si hoy todavía no tiene captura (la jornada sigue en
 * curso) la comparación corta en AYER para ambas semanas.
 */
function calcWeekOverWeek(
  days: DailyMetrics[],
  referenceDate: Date,
  weekStartDay: number,
): WeekOverWeek {
  const today = startOfLocalDay(referenceDate);
  const startDay = ((Math.round(safeNumber(weekStartDay)) % 7) + 7) % 7;
  const backtrack = (today.getDay() - startDay + 7) % 7;

  const todayKey = toDateKey(today);
  const todayCaptured = days.some((day) => day.dateKey === todayKey && day.margenNeto !== null);
  const elapsed = todayCaptured || backtrack === 0 ? backtrack : backtrack - 1;

  const currentStart = addDaysLocal(today, -backtrack);
  const currentEnd = addDaysLocal(currentStart, elapsed);
  const previousStart = addDaysLocal(currentStart, -7);
  const previousEnd = addDaysLocal(previousStart, elapsed);

  const current = sumWeek(days, currentStart, currentEnd);
  const previous = sumWeek(days, previousStart, previousEnd);

  return {
    current,
    previous,
    margenNetoPct:
      current.days > 0 && previous.days > 0
        ? percentChange(current.margenNeto, previous.margenNeto)
        : null,
    rKmPct: percentChange(current.rKm, previous.rKm),
  };
}

export interface AggregatesInput {
  /** Todos los días disponibles; puede incluir días fuera del mes (para WoW). */
  days: DailyMetrics[];
  referenceDate: Date;
  /** Día en que arranca la semana, 0 (Domingo) a 6 (Sábado). */
  weekStartDay: number;
  /** `YYYY-MM`; por defecto el mes de `referenceDate`. */
  month?: string;
}

export function calcWeeklyAndMonthlyAggregates(input: AggregatesInput): MonthlyAggregates {
  const month = input.month ?? toDateKey(input.referenceDate).slice(0, 7);
  const monthDays = input.days
    .filter((day) => day.dateKey.startsWith(month))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  // IRD: cada día se califica contra el resto del mes.
  const irdByDay = new Map<string, IrdBreakdown>();
  let starDay: StarDay | null = null;
  for (const day of monthDays) {
    const ird = calcIRD(day, monthDays);
    if (!ird) continue;
    irdByDay.set(day.dateKey, ird);
    // argmax(IRD); en empate gana el de mayor R_hr, luego el más reciente.
    if (
      !starDay ||
      ird.score > starDay.ird.score ||
      (ird.score === starDay.ird.score && (day.rHora ?? 0) >= (starDay.metrics.rHora ?? 0))
    ) {
      starDay = { metrics: day, ird };
    }
  }

  // Eficiencia de flota ponderada por volumen, no promedio de razones diarias:
  // un día de 20 km no debe pesar igual que uno de 250 km.
  let kmDidi = 0;
  let kmTotal = 0;
  let minActivo = 0;
  let minConectado = 0;
  for (const day of monthDays) {
    if (day.etaKm !== null && day.kmDidi !== null && day.kmTotal !== null) {
      kmDidi += day.kmDidi;
      kmTotal += day.kmTotal;
    }
    if (day.etaTiempo !== null && day.minActivo !== null && day.minConectado !== null) {
      minConectado += day.minConectado;
      minActivo += day.minActivo;
    }
  }

  const weekdayProfile: WeekdayProfileRow[] = MONDAY_FIRST.map((weekday) => {
    const bucket = monthDays.filter((day) => parseDateKey(day.dateKey).getDay() === weekday);
    const rKms = bucket.flatMap((day) => (day.rKm !== null ? [day.rKm] : []));
    const rHoras = bucket.flatMap((day) => (day.rHora !== null ? [day.rHora] : []));
    const deadRatios = bucket.flatMap((day) => (day.etaKm !== null ? [1 - day.etaKm] : []));
    const avgRKm = mean(rKms);
    const avgRHora = mean(rHoras);
    const avgDead = mean(deadRatios);
    return {
      weekday,
      label: WEEKDAY_NAMES[weekday] ?? '',
      days: Math.max(rKms.length, rHoras.length, deadRatios.length),
      avgRKm: roundOrNull(avgRKm),
      avgRHora: roundOrNull(avgRHora),
      avgDeadKmRatio: roundOrNull(avgDead, round4),
    };
  });

  const pickMax = (key: 'avgRHora' | 'avgDeadKmRatio'): WeekdayProfileRow | null =>
    weekdayProfile.reduce<WeekdayProfileRow | null>((best, row) => {
      const value = row[key];
      if (value === null) return best;
      return best === null || value > (best[key] ?? -Infinity) ? row : best;
    }, null);

  return {
    month,
    days: monthDays,
    irdByDay,
    starDay,
    fleet: {
      etaKm: kmTotal > 0 ? round4(kmDidi / kmTotal) : null,
      etaTiempo: minConectado > 0 ? round4(minActivo / minConectado) : null,
      kmDidi: round2(kmDidi),
      kmTotal: round2(kmTotal),
    },
    weekdayProfile,
    bestRHoraWeekday: pickMax('avgRHora'),
    worstDeadKmWeekday: pickMax('avgDeadKmRatio'),
    weekOverWeek: calcWeekOverWeek(input.days, input.referenceDate, input.weekStartDay),
  };
}

/**
 * Fachada con los nombres del modelo (`OperationalAnalytics.calcIRD(...)`).
 * Las funciones sueltas siguen exportadas para importar sólo lo necesario.
 */
export const OperationalAnalytics = {
  calcDailyMetrics,
  calcIRD,
  calcWeeklyAndMonthlyAggregates,
} as const;

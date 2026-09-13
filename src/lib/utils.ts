import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { addDays, differenceInCalendarDays, format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';

/** Tailwind-aware className merger used by every UI primitive. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/* -------------------------------------------------------------------------- */
/*                             Numeric sanitation                             */
/* -------------------------------------------------------------------------- */

/**
 * Converts anything into a finite number. Guarantees the budget engine never
 * propagates `NaN` / `Infinity` into the UI, no matter how corrupt the stored
 * IndexedDB record is.
 */
export function safeNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Rounds to cents, killing floating point drift such as 0.1 + 0.2. */
export function roundCurrency(value: number): number {
  const safe = safeNumber(value);
  return Math.round((safe + Number.EPSILON) * 100) / 100;
}

/**
 * Satura un valor al rango dado.
 *
 * `Infinity` se satura en `max` y `-Infinity` en `min` (semántica real de
 * clamp), mientras que `NaN` —que no tiene orden— cae al extremo conservador
 * `min`. Nunca devuelve un valor no finito.
 */
export function clamp(value: number, min: number, max: number): number {
  const raw = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(raw)) return min;
  if (raw < min) return min;
  if (raw > max) return max;
  return raw;
}

/* -------------------------------------------------------------------------- */
/*                            Currency formatting                             */
/* -------------------------------------------------------------------------- */

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** `$1,234.50` — symbol is user configurable in settings. */
export function formatCurrency(amount: number, symbol = '$'): string {
  const safe = roundCurrency(amount);
  const sign = safe < 0 ? '-' : '';
  return `${sign}${symbol}${currencyFormatter.format(Math.abs(safe))}`;
}

/** `$1,235` — for dense surfaces such as chart axes and day dots. */
export function formatCompactCurrency(amount: number, symbol = '$'): string {
  const safe = roundCurrency(amount);
  const sign = safe < 0 ? '-' : '';
  return `${sign}${symbol}${compactFormatter.format(Math.abs(safe))}`;
}

/** `+$80.00` / `-$70.00` — used by the rollover readouts. */
export function formatSignedCurrency(amount: number, symbol = '$'): string {
  const safe = roundCurrency(amount);
  const prefix = safe > 0 ? '+' : '';
  return `${prefix}${formatCurrency(safe, symbol)}`;
}

/* -------------------------------------------------------------------------- */
/*                                Date helpers                                */
/* -------------------------------------------------------------------------- */

/**
 * Parses a `YYYY-MM-DD` key into LOCAL midnight.
 *
 * `new Date('2026-09-13')` is parsed as UTC midnight by the spec, which lands on
 * the previous calendar day for every negative offset (including America/Mexico
 * City). Building the date component-wise keeps cycle boundaries aligned with
 * the wall clock the user actually reads.
 */
export function parseDateKey(key: string): Date {
  const [yearRaw, monthRaw, dayRaw] = key.slice(0, 10).split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return startOfLocalDay(new Date());
  }
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/** Local midnight of the given date. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** `YYYY-MM-DD` in local time — the canonical cycle boundary format. */
export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Normalizes a stored transaction timestamp (full ISO) or a cycle boundary
 * (date-only) into a comparable local `Date`.
 */
export function parseTimestamp(value: string): Date {
  if (value.length <= 10) return parseDateKey(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? parseDateKey(value) : parsed;
}

export function isToday(value: string, reference: Date = new Date()): boolean {
  return isSameDay(parseTimestamp(value), reference);
}

/** Inclusive whole-day distance: same day -> 0. */
export function daysBetween(from: Date, to: Date): number {
  return differenceInCalendarDays(startOfLocalDay(to), startOfLocalDay(from));
}

export function addDaysLocal(date: Date, amount: number): Date {
  return startOfLocalDay(addDays(date, amount));
}

/** `mié 13 sep` */
export function formatShortDate(date: Date): string {
  return format(date, "EEE d MMM", { locale: es });
}

/** `Miércoles 13 de septiembre` */
export function formatLongDate(date: Date): string {
  return format(date, "EEEE d 'de' MMMM", { locale: es });
}

/** `L`, `M`, `X`… single-letter day initials for the sprint dots. */
export function formatDayInitial(date: Date): string {
  return format(date, 'EEEEE', { locale: es }).toUpperCase();
}

export function formatTime(value: string): string {
  return format(parseTimestamp(value), 'HH:mm');
}

/** `13 sep – 19 sep` */
export function formatDateRange(startKey: string, endKey: string): string {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  return `${format(start, 'd MMM', { locale: es })} – ${format(end, 'd MMM', { locale: es })}`;
}

export const WEEKDAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export function weekdayName(index: number): string {
  return WEEKDAY_NAMES[clamp(Math.round(index), 0, 6)] ?? 'Domingo';
}

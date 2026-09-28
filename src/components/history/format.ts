import { formatCurrency } from '@/lib/utils';

/** Formateadores compartidos por la auditoría diaria y el tablero operativo. */

const kmFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const pctFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });

export function formatKm(value: number | null): string {
  return value === null ? '—' : `${kmFormatter.format(value)} km`;
}

/** Razón 0..1 → `75%`. */
export function formatRatio(value: number | null): string {
  return value === null ? '—' : `${pctFormatter.format(value * 100)}%`;
}

/** `+12.5%` / `-3%`, para variaciones. */
export function formatSignedPct(value: number | null): string {
  if (value === null) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${pctFormatter.format(value)}%`;
}

export function formatMoney(value: number | null, symbol: string): string {
  return value === null ? '—' : formatCurrency(value, symbol);
}

/** `8 h 30 min`. */
export function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

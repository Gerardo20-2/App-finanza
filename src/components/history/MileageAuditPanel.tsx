'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ChevronDown, Gauge } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EMPTY_DAILY_LOG, saveDailyLog, type DailyLog, type DailyLogFields } from '@/lib/db';
import { computeMileageAudit, parseHours, parseNonNegative } from '@/lib/mileageAudit';
import { cn, formatCurrency } from '@/lib/utils';

/** Espera tras la última tecla antes de escribir en IndexedDB. */
const SAVE_DELAY_MS = 350;

const kmFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const pctFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });

function formatKm(value: number | null): string {
  return value === null ? '—' : `${kmFormatter.format(value)} km`;
}

function formatPct(value: number | null): string {
  return value === null ? '—' : `${pctFormatter.format(value)}%`;
}

function formatMoney(value: number | null, symbol: string): string {
  return value === null ? '—' : formatCurrency(value, symbol);
}

interface FieldConfig {
  key: keyof DailyLogFields;
  label: string;
  placeholder: string;
  inputMode: 'decimal' | 'text';
}

const FIELDS: FieldConfig[] = [
  { key: 'kmInicio', label: 'Km inicio', placeholder: 'Odómetro al salir', inputMode: 'decimal' },
  { key: 'kmFin', label: 'Km fin', placeholder: 'Odómetro al volver', inputMode: 'decimal' },
  { key: 'kmDidi', label: 'Km DiDi', placeholder: 'Según la app', inputMode: 'decimal' },
  { key: 'horasConectado', label: 'Horas conectado', placeholder: '8.5 o 8:30', inputMode: 'text' },
  { key: 'ingresoDidi', label: 'Ingreso DiDi ($)', placeholder: 'Pago del día', inputMode: 'decimal' },
];

function toFields(log: DailyLog | undefined): DailyLogFields {
  if (!log) return { ...EMPTY_DAILY_LOG };
  return {
    kmInicio: log.kmInicio,
    kmFin: log.kmFin,
    kmDidi: log.kmDidi,
    horasConectado: log.horasConectado,
    ingresoDidi: log.ingresoDidi,
  };
}

/**
 * Detalle de odómetro/km de una tarjeta diaria. Plegado por defecto para no
 * saturar el historial; el resumen de la cabecera deja ver el reparto sin
 * abrirlo.
 *
 * La gasolina del día NO se captura aquí: sale de los gastos `combustible`
 * que ya se registraron ese día, así que el prorrateo siempre cuadra con lo
 * que descontó el presupuesto.
 */
export function MileageAuditPanel({
  dateKey,
  log,
  gasolinaTotal,
  currencySymbol,
  onToggle,
}: {
  dateKey: string;
  log: DailyLog | undefined;
  gasolinaTotal: number;
  currencySymbol: string;
  onToggle?: () => void;
}) {
  const [isOpen, setOpen] = useState(false);
  const [draft, setDraft] = useState<DailyLogFields>(() => toFields(log));

  // El registro llega de IndexedDB después del primer render: se hidrata una
  // sola vez y, si el usuario ya empezó a escribir, su borrador manda.
  const isDirty = useRef(false);
  useEffect(() => {
    if (!isDirty.current) setDraft(toFields(log));
  }, [log]);

  const pending = useRef<Partial<DailyLogFields>>({});
  const timer = useRef<number | undefined>(undefined);

  const flush = () => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length > 0) void saveDailyLog(dateKey, patch);
  };

  // Guarda lo pendiente si la tarjeta se desmonta antes del debounce.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  const handleChange = (key: keyof DailyLogFields, value: string) => {
    isDirty.current = true;
    setDraft((prev) => ({ ...prev, [key]: value }));
    pending.current = { ...pending.current, [key]: value };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
  };

  const hoursParsed = parseHours(draft.horasConectado);
  const hoursInvalid = draft.horasConectado.trim() !== '' && hoursParsed === null;

  const audit = useMemo(
    () =>
      computeMileageAudit({
        kmInicio: parseNonNegative(draft.kmInicio),
        kmFin: parseNonNegative(draft.kmFin),
        kmDidi: parseNonNegative(draft.kmDidi),
        horasConectado: hoursParsed,
        gasolinaTotal,
        ingresoDidi: parseNonNegative(draft.ingresoDidi),
      }),
    [draft, hoursParsed, gasolinaTotal],
  );

  const invalidFields: Partial<Record<keyof DailyLogFields, boolean>> = {
    kmFin: audit.odometroInvalido,
    kmDidi: audit.didiExcedeTotal,
    horasConectado: hoursInvalid,
  };
  const hasWarning = audit.odometroInvalido || audit.didiExcedeTotal || hoursInvalid;
  const hasData = Object.values(draft).some((value) => value.trim() !== '');

  const panelId = `mileage-${dateKey}`;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border bg-zinc-900/70',
        hasWarning ? 'border-rose-500/60' : 'border-zinc-800',
      )}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => {
          onToggle?.();
          setOpen((open) => !open);
        }}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-zinc-400">
          <Gauge className="h-3.5 w-3.5 shrink-0 text-zinc-500" strokeWidth={2.3} />
          Detalle de odómetro / km
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {hasWarning ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" strokeWidth={2.3} />
          ) : audit.isComplete ? (
            <span className="text-[11px] font-semibold tabular-nums text-emerald-400">
              {formatPct(audit.pctDidi)} DiDi
            </span>
          ) : hasData ? null : (
            <span className="text-[11px] text-zinc-600">Sin capturar</span>
          )}
          <ChevronDown
            className={cn('h-4 w-4 text-zinc-600 transition-transform', isOpen && 'rotate-180')}
            strokeWidth={2.3}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-zinc-800"
          >
            <div className="space-y-3 p-3.5">
              <div className="grid grid-cols-2 gap-2.5">
                {FIELDS.map((field) => {
                  const id = `${panelId}-${field.key}`;
                  const invalid = invalidFields[field.key] ?? false;
                  return (
                    <div
                      key={field.key}
                      className={cn('space-y-1', field.key === 'ingresoDidi' && 'col-span-2')}
                    >
                      <Label htmlFor={id} className="text-[10px]">
                        {field.label}
                      </Label>
                      <Input
                        id={id}
                        type="text"
                        inputMode={field.inputMode}
                        autoComplete="off"
                        placeholder={field.placeholder}
                        value={draft[field.key]}
                        aria-invalid={invalid}
                        onChange={(event) => handleChange(field.key, event.target.value)}
                        onBlur={flush}
                        className={cn(
                          'h-10 px-3',
                          invalid &&
                            'border-rose-500/70 focus-visible:border-rose-500 focus-visible:ring-rose-500/40',
                        )}
                      />
                    </div>
                  );
                })}
              </div>

              {hasWarning ? (
                <ul
                  role="alert"
                  className="space-y-1 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300"
                >
                  {audit.odometroInvalido ? (
                    <li className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.5} />
                      El km final es menor que el inicial.
                    </li>
                  ) : null}
                  {audit.didiExcedeTotal ? (
                    <li className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.5} />
                      Los km de DiDi superan los {formatKm(audit.kmTotales)} que recorriste.
                    </li>
                  ) : null}
                  {hoursInvalid ? (
                    <li className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.5} />
                      Escribe las horas como 8.5 o 8:30.
                    </li>
                  ) : null}
                </ul>
              ) : null}

              <div className="flex items-baseline justify-between text-xs">
                <span className="text-zinc-500">
                  Recorrido total{' '}
                  <span className="font-semibold tabular-nums text-zinc-200">
                    {formatKm(audit.kmTotales)}
                  </span>
                </span>
                <span className="text-zinc-500">
                  Gasolina del día{' '}
                  <span className="font-semibold tabular-nums text-sky-400">
                    {formatCurrency(gasolinaTotal, currencySymbol)}
                  </span>
                </span>
              </div>

              {audit.isComplete ? (
                <>
                  <div
                    className="flex h-1.5 overflow-hidden rounded-full bg-zinc-800"
                    aria-hidden="true"
                  >
                    <div className="bg-emerald-500" style={{ width: `${audit.pctDidi ?? 0}%` }} />
                    <div className="bg-amber-400" style={{ width: `${audit.pctPersonal ?? 0}%` }} />
                  </div>

                  <div className="space-y-1.5">
                    <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-200">
                      <span className="font-semibold">Uso DiDi:</span>{' '}
                      <span className="tabular-nums">
                        {formatKm(audit.kmDidi)} ({formatPct(audit.pctDidi)}) →{' '}
                        <span className="font-semibold">
                          {formatMoney(audit.gasolinaDidi, currencySymbol)}
                        </span>{' '}
                        de tu gasolina
                      </span>
                    </p>
                    <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-2.5 py-2 text-xs text-amber-200">
                      <span className="font-semibold">Uso Personal:</span>{' '}
                      <span className="tabular-nums">
                        {formatKm(audit.kmPersonales)} ({formatPct(audit.pctPersonal)}) →{' '}
                        <span className="font-semibold">
                          {formatMoney(audit.gasolinaPersonal, currencySymbol)}
                        </span>{' '}
                        de tu gasolina
                      </span>
                    </p>
                  </div>
                </>
              ) : !hasWarning ? (
                <p className="text-xs text-zinc-600">
                  Captura km inicio, km fin y km DiDi para ver el reparto de tu gasolina.
                </p>
              ) : null}

              <div className="rounded-xl bg-zinc-950/60 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-zinc-600">Rendimiento</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-200">
                  {formatMoney(audit.gananciaPorKm, currencySymbol)}/km DiDi
                  <span className="mx-1.5 font-normal text-zinc-700">|</span>
                  {formatMoney(audit.gananciaPorHora, currencySymbol)}/hr conectado
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Costo real de gasolina:{' '}
                  <span className="font-semibold tabular-nums text-sky-400">
                    {formatMoney(audit.costoGasolinaPorKm, currencySymbol)}/km
                  </span>
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

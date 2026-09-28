'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ChevronDown, Gauge } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readDailyLogFields, saveDailyLog, type DailyLog, type DailyLogFields } from '@/lib/db';
import {
  calcDailyMetrics,
  dayDataFromCapture,
  parseDurationMinutes,
  parseTripCount,
} from '@/lib/operationalAnalytics';
import { cn, formatCurrency } from '@/lib/utils';

import { formatHours, formatKm, formatMoney, formatRatio } from './format';

/** Espera tras la última tecla antes de escribir en IndexedDB. */
const SAVE_DELAY_MS = 350;

interface FieldConfig {
  key: keyof DailyLogFields;
  label: string;
  placeholder: string;
  inputMode: 'decimal' | 'numeric' | 'text';
  wide?: boolean;
}

const FIELDS: FieldConfig[] = [
  { key: 'kmInicio', label: 'Km inicio', placeholder: 'Odómetro al salir', inputMode: 'decimal' },
  { key: 'kmFin', label: 'Km fin', placeholder: 'Odómetro al volver', inputMode: 'decimal' },
  { key: 'kmDidi', label: 'Km DiDi', placeholder: 'Distancia en la app', inputMode: 'decimal' },
  { key: 'numViajes', label: 'Viajes', placeholder: 'Completados', inputMode: 'numeric' },
  { key: 'horasConectado', label: 'Tiempo conectado', placeholder: '8:30 o 510 min', inputMode: 'text' },
  { key: 'tiempoActivo', label: 'Tiempo activo', placeholder: '6:15 o 375 min', inputMode: 'text' },
  { key: 'ingresoDidi', label: 'Ingreso DiDi ($)', placeholder: 'Pago del día', inputMode: 'decimal', wide: true },
];

function isFilled(value: string): boolean {
  return value.trim() !== '';
}

/**
 * Detalle de odómetro y tablero DiDi de una tarjeta diaria. Plegado por
 * defecto para no saturar el historial; la cabecera deja ver el reparto sin
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
  const [draft, setDraft] = useState<DailyLogFields>(() => readDailyLogFields(log));

  // El registro llega de IndexedDB después del primer render: se hidrata una
  // sola vez y, si el usuario ya empezó a escribir, su borrador manda.
  const isDirty = useRef(false);
  useEffect(() => {
    if (!isDirty.current) setDraft(readDailyLogFields(log));
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

  const metrics = useMemo(
    () => calcDailyMetrics(dayDataFromCapture(dateKey, draft, gasolinaTotal)),
    [dateKey, draft, gasolinaTotal],
  );

  const conectadoInvalid =
    isFilled(draft.horasConectado) && parseDurationMinutes(draft.horasConectado) === null;
  const activoInvalid =
    isFilled(draft.tiempoActivo) && parseDurationMinutes(draft.tiempoActivo) === null;
  const viajesInvalid = isFilled(draft.numViajes) && parseTripCount(draft.numViajes) === null;

  const invalidFields: Partial<Record<keyof DailyLogFields, boolean>> = {
    kmFin: metrics.odometroInvalido,
    kmDidi: metrics.didiExcedeTotal,
    horasConectado: conectadoInvalid,
    tiempoActivo: activoInvalid || metrics.activoExcedeConectado,
    numViajes: viajesInvalid,
  };

  const warnings = [
    metrics.odometroInvalido && 'El km final es menor que el inicial.',
    metrics.didiExcedeTotal &&
      `Los km de DiDi superan los ${formatKm(metrics.kmTotal)} que recorriste.`,
    (conectadoInvalid || activoInvalid) && 'Escribe los tiempos como 8:30, 8 h 30 min o 510 min.',
    metrics.activoExcedeConectado && 'El tiempo activo no puede superar al tiempo conectado.',
    viajesInvalid && 'Los viajes deben ser un número entero.',
  ].filter((item): item is string => typeof item === 'string');

  const hasWarning = warnings.length > 0;
  const hasData = Object.values(draft).some(isFilled);
  const isSplit = metrics.etaKm !== null;

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
          ) : isSplit ? (
            <span className="text-[11px] font-semibold tabular-nums text-emerald-400">
              {formatRatio(metrics.etaKm)} DiDi
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
                    <div key={field.key} className={cn('space-y-1', field.wide && 'col-span-2')}>
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
                  {warnings.map((warning) => (
                    <li key={warning} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.5} />
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="flex items-baseline justify-between text-xs">
                <span className="text-zinc-500">
                  Recorrido total{' '}
                  <span className="font-semibold tabular-nums text-zinc-200">
                    {formatKm(metrics.kmTotal)}
                  </span>
                </span>
                <span className="text-zinc-500">
                  Gasolina del día{' '}
                  <span className="font-semibold tabular-nums text-sky-400">
                    {formatCurrency(gasolinaTotal, currencySymbol)}
                  </span>
                </span>
              </div>

              {isSplit ? (
                <>
                  <div
                    className="flex h-1.5 overflow-hidden rounded-full bg-zinc-800"
                    aria-hidden="true"
                  >
                    <div className="bg-emerald-500" style={{ width: `${(metrics.etaKm ?? 0) * 100}%` }} />
                    <div className="flex-1 bg-amber-400" />
                  </div>

                  <div className="space-y-1.5">
                    <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-200">
                      <span className="font-semibold">Uso DiDi:</span>{' '}
                      <span className="tabular-nums">
                        {formatKm(metrics.kmDidi)} ({formatRatio(metrics.etaKm)}) →{' '}
                        <span className="font-semibold">
                          {formatMoney(metrics.gasDidi, currencySymbol)}
                        </span>{' '}
                        de tu gasolina
                      </span>
                    </p>
                    <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-2.5 py-2 text-xs text-amber-200">
                      <span className="font-semibold">Uso Personal:</span>{' '}
                      <span className="tabular-nums">
                        {formatKm(metrics.kmMuertos)} (
                        {formatRatio(metrics.etaKm === null ? null : 1 - metrics.etaKm)}) →{' '}
                        <span className="font-semibold">
                          {formatMoney(metrics.gasPersonal, currencySymbol)}
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

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-zinc-950/60 p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-600">Ocupación</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-200">
                    {formatRatio(metrics.etaTiempo)}
                  </p>
                  <p className="text-[10px] text-zinc-600">tiempo activo / conectado</p>
                </div>
                <div className="rounded-xl bg-zinc-950/60 p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-600">Km útiles</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-200">
                    {formatRatio(metrics.etaKm)}
                  </p>
                  <p className="text-[10px] text-zinc-600">km DiDi / odómetro</p>
                </div>
              </div>

              <div className="rounded-xl bg-zinc-950/60 p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-600">Rendimiento neto</p>
                  <p className="text-[11px] text-zinc-500">
                    Margen{' '}
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        (metrics.margenNeto ?? 0) < 0 ? 'text-rose-400' : 'text-emerald-400',
                      )}
                    >
                      {formatMoney(metrics.margenNeto, currencySymbol)}
                    </span>
                  </p>
                </div>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-200">
                  {formatMoney(metrics.rKm, currencySymbol)}/km DiDi
                  <span className="mx-1.5 font-normal text-zinc-700">|</span>
                  {formatMoney(metrics.rHora, currencySymbol)}/hr conectado
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Bruto{' '}
                  <span className="tabular-nums">
                    {formatMoney(metrics.brutoKm, currencySymbol)}/km ·{' '}
                    {formatMoney(metrics.brutoHora, currencySymbol)}/hr
                  </span>
                  <span className="mx-1">·</span>
                  {formatHours(metrics.horasConectado)} conectado
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Ticket promedio{' '}
                  <span className="font-semibold tabular-nums text-zinc-300">
                    {formatMoney(metrics.epv, currencySymbol)}
                  </span>
                  <span className="mx-1">·</span>
                  Gasolina real{' '}
                  <span className="font-semibold tabular-nums text-sky-400">
                    {formatMoney(metrics.costoGasKm, currencySymbol)}/km
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

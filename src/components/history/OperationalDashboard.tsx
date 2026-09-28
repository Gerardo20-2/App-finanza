'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BrainCircuit, ChevronDown, Star, TrendingDown, TrendingUp } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { IRD_WEIGHTS, type IrdBreakdown, type MonthlyAggregates } from '@/lib/operationalAnalytics';
import { cn, formatDateRange, formatLongDate, parseDateKey } from '@/lib/utils';

import { formatHours, formatMoney, formatRatio, formatSignedPct } from './format';

/** Color del score: mismo semáforo que el resto de la app. */
function scoreTone(score: number): string {
  if (score >= 80) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (score >= 50) return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
  return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
}

/** Badge "Score: 94/100" de cada tarjeta diaria. */
export function IrdBadge({ ird, isStar = false }: { ird: IrdBreakdown | undefined; isStar?: boolean }) {
  if (!ird) return null;
  return (
    <span
      title="Índice de Rendimiento Diario, calificado contra los demás días del mes"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums',
        scoreTone(ird.score),
      )}
    >
      {isStar ? <Star className="h-2.5 w-2.5 fill-current" strokeWidth={2.5} /> : null}
      Score: {ird.score}/100
    </span>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-zinc-950/60 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-200">{value}</p>
      {hint ? <p className="text-[10px] text-zinc-600">{hint}</p> : null}
    </div>
  );
}

function RatioBar({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-semibold tabular-nums text-zinc-200">{formatRatio(value)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${(value ?? 0) * 100}%` }} />
      </div>
    </div>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-zinc-600">—</span>;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-semibold tabular-nums',
        up ? 'text-emerald-400' : 'text-rose-400',
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {formatSignedPct(value)}
    </span>
  );
}

/** Un solo día se muestra sin rango; `from > to` ocurre el primer día sin captura. */
function formatShortRange(from: string, to: string): string {
  if (from > to) return 'sin días';
  return from === to ? formatDateRange(from, to).split(' – ')[0] ?? from : formatDateRange(from, to);
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });

/**
 * "Tablero de Inteligencia Operativa": agregados del mes en curso. Plegado por
 * defecto al pie del historial.
 */
export function OperationalDashboard({
  month,
  currencySymbol,
  onToggle,
}: {
  month: MonthlyAggregates;
  currencySymbol: string;
  onToggle?: () => void;
}) {
  const [isOpen, setOpen] = useState(false);
  const { starDay, fleet, weekdayProfile, bestRHoraWeekday, worstDeadKmWeekday, weekOverWeek } =
    month;
  const monthLabel = MONTH_FORMATTER.format(parseDateKey(`${month.month}-01`));
  const hasData = month.days.length > 0;

  return (
    <section className="mt-7">
      <Card className="overflow-hidden">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls="operational-dashboard"
          onClick={() => {
            onToggle?.();
            setOpen((open) => !open);
          }}
          className="flex w-full items-center justify-between gap-3 p-3.5 text-left"
        >
          <span className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-emerald-400" strokeWidth={2.3} />
            <span>
              <span className="block text-sm font-medium text-zinc-200">
                Tablero de Inteligencia Operativa
              </span>
              <span className="block text-[11px] text-zinc-600 first-letter:uppercase">
                {monthLabel} · {month.days.length} {month.days.length === 1 ? 'día' : 'días'} con datos
              </span>
            </span>
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-zinc-600 transition-transform', isOpen && 'rotate-180')}
            strokeWidth={2.3}
          />
        </button>

        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.div
              id="operational-dashboard"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-zinc-800"
            >
              {!hasData ? (
                <p className="p-3.5 text-xs text-zinc-600">
                  Captura el detalle de odómetro / km en tus tarjetas diarias para ver la analítica
                  del mes.
                </p>
              ) : (
                <div className="space-y-3 p-3.5">
                  {/* Card 1 — Día de Mayor Rentabilidad */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-zinc-500">
                        <Star className="h-3.5 w-3.5 text-amber-300" strokeWidth={2.3} />
                        Día de mayor rentabilidad
                      </h3>
                      {starDay ? <IrdBadge ird={starDay.ird} /> : null}
                    </div>
                    {starDay ? (
                      <>
                        <p className="mt-1.5 text-base font-semibold text-zinc-100 first-letter:uppercase">
                          {formatLongDate(parseDateKey(starDay.metrics.dateKey))}
                        </p>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <Tile
                            label="$/km neto"
                            value={formatMoney(starDay.metrics.rKm, currencySymbol)}
                          />
                          <Tile
                            label="$/hr neto"
                            value={formatMoney(starDay.metrics.rHora, currencySymbol)}
                          />
                          <Tile label="Horas" value={formatHours(starDay.metrics.horasConectado)} />
                        </div>
                      </>
                    ) : (
                      <p className="mt-1.5 text-xs text-zinc-600">
                        Para calificar un día hacen falta ingreso, km (odómetro y DiDi) y tiempos
                        conectado y activo.
                      </p>
                    )}
                  </div>

                  {/* Card 2 — Eficiencia de Flota */}
                  <div className="space-y-2.5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                    <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                      Eficiencia de flota
                    </h3>
                    <RatioBar label="Km útiles (DiDi / odómetro)" value={fleet.etaKm} tone="bg-emerald-500" />
                    <RatioBar
                      label="Tiempo activo (activo / conectado)"
                      value={fleet.etaTiempo}
                      tone="bg-sky-500"
                    />
                    <p className="text-[10px] text-zinc-600">
                      Promedio del mes ponderado por volumen: los días largos pesan más.
                    </p>

                    <div className="border-t border-zinc-800 pt-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-600">
                        Semana vs. mismos días de la anterior
                      </p>
                      <p className="text-[10px] text-zinc-600">
                        {formatShortRange(weekOverWeek.current.from, weekOverWeek.current.to)} (
                        {weekOverWeek.current.days} d) contra{' '}
                        {formatShortRange(weekOverWeek.previous.from, weekOverWeek.previous.to)} (
                        {weekOverWeek.previous.days} d)
                      </p>
                      <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-zinc-500">Margen neto</p>
                          <p className="font-semibold tabular-nums text-zinc-200">
                            {formatMoney(weekOverWeek.current.margenNeto, currencySymbol)}
                          </p>
                          <Delta value={weekOverWeek.margenNetoPct} />
                        </div>
                        <div>
                          <p className="text-zinc-500">Ganancia / km</p>
                          <p className="font-semibold tabular-nums text-zinc-200">
                            {formatMoney(weekOverWeek.current.rKm, currencySymbol)}
                          </p>
                          <Delta value={weekOverWeek.rKmPct} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 3 — Perfil por día de la semana */}
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                    <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                      Por día de la semana
                    </h3>
                    <table className="mt-2 w-full text-xs tabular-nums">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-zinc-600">
                          <th scope="col" className="pb-1.5 text-left font-medium">Día</th>
                          <th scope="col" className="pb-1.5 text-right font-medium">$/km</th>
                          <th scope="col" className="pb-1.5 text-right font-medium">$/hr</th>
                          <th scope="col" className="pb-1.5 text-right font-medium">Km muertos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weekdayProfile.map((row) => {
                          const isBest = bestRHoraWeekday?.weekday === row.weekday;
                          const isWorstDead = worstDeadKmWeekday?.weekday === row.weekday;
                          return (
                            <tr
                              key={row.weekday}
                              className={cn('border-t border-zinc-800/70', row.days === 0 && 'text-zinc-700')}
                            >
                              <th scope="row" className="py-1.5 text-left font-medium text-zinc-300">
                                {row.label}
                                {row.days > 0 ? (
                                  <span className="ml-1 text-[10px] font-normal text-zinc-600">×{row.days}</span>
                                ) : null}
                              </th>
                              <td className="py-1.5 text-right text-zinc-300">
                                {formatMoney(row.avgRKm, currencySymbol)}
                              </td>
                              <td
                                className={cn(
                                  'py-1.5 text-right',
                                  isBest ? 'font-semibold text-emerald-400' : 'text-zinc-300',
                                )}
                              >
                                {formatMoney(row.avgRHora, currencySymbol)}
                              </td>
                              <td
                                className={cn(
                                  'py-1.5 text-right',
                                  isWorstDead ? 'font-semibold text-amber-300' : 'text-zinc-400',
                                )}
                              >
                                {formatRatio(row.avgDeadKmRatio)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[11px] text-zinc-500">
                      {bestRHoraWeekday ? (
                        <>
                          Más rentable por hora:{' '}
                          <span className="font-semibold text-emerald-400">{bestRHoraWeekday.label}</span>.{' '}
                        </>
                      ) : null}
                      {worstDeadKmWeekday ? (
                        <>
                          Más km muertos:{' '}
                          <span className="font-semibold text-amber-300">{worstDeadKmWeekday.label}</span>.
                        </>
                      ) : null}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-600">
                      Montos netos de gasolina DiDi, promedio de los días capturados (×n).
                    </p>
                  </div>

                  <p className="px-1 text-[10px] leading-relaxed text-zinc-600">
                    Score IRD = {IRD_WEIGHTS.rKm * 100}% $/km neto + {IRD_WEIGHTS.rHora * 100}% $/hr neto
                    (ambos contra el mejor día del mes) + {IRD_WEIGHTS.etaTiempo * 100}% tiempo activo +{' '}
                    {IRD_WEIGHTS.etaKm * 100}% km útiles.
                  </p>
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Card>
    </section>
  );
}

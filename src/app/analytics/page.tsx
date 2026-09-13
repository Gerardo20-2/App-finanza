'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Table2, TrendingDown, TrendingUp } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { useWeeklyBudget } from '@/hooks/useWeeklyBudget';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CHART_COLORS,
  type BurnPoint,
} from '@/lib/budgetEngine';
import { cn, formatCompactCurrency, formatCurrency, roundCurrency } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*                                  Tooltip                                   */
/* -------------------------------------------------------------------------- */

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number | string;
  payload?: BurnPoint;
}

function BurnTooltip({
  active,
  payload,
  currencySymbol,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  currencySymbol: string;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  const delta =
    point.actual === null ? null : roundCurrency(point.actual - point.ideal);

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/95 px-3 py-2.5 shadow-xl shadow-black/50 backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        Día {point.day}
      </p>

      <dl className="mt-1.5 space-y-1">
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: CHART_COLORS.actual }}
            />
            Real
          </dt>
          <dd className="text-xs font-semibold tabular-nums text-zinc-100">
            {point.actual === null ? '—' : formatCurrency(point.actual, currencySymbol)}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              aria-hidden="true"
              className="h-0.5 w-2.5 rounded-full"
              style={{ backgroundColor: CHART_COLORS.ideal }}
            />
            Ideal
          </dt>
          <dd className="text-xs font-semibold tabular-nums text-zinc-300">
            {formatCurrency(point.ideal, currencySymbol)}
          </dd>
        </div>
      </dl>

      {delta !== null ? (
        <p
          className={cn(
            'mt-1.5 border-t border-zinc-800 pt-1.5 text-[11px] font-medium tabular-nums',
            delta > 0 ? 'text-rose-400' : 'text-emerald-400',
          )}
        >
          {delta > 0 ? 'Vas arriba del ideal por ' : 'Vas abajo del ideal por '}
          {formatCurrency(Math.abs(delta), currencySymbol)}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Página                                   */
/* -------------------------------------------------------------------------- */

export default function AnalyticsPage() {
  const { isReady, settings, snapshot, burnSeries, dailyUsage, categoryTotals } =
    useWeeklyBudget();
  const [showTable, setShowTable] = useState(false);

  const symbol = settings.currencySymbol;

  /** Último punto con dato real: ahí va la etiqueta directa y el marcador. */
  const lastActualIndex = useMemo(() => {
    for (let index = burnSeries.length - 1; index >= 0; index -= 1) {
      if (burnSeries[index]?.actual !== null) return index;
    }
    return -1;
  }, [burnSeries]);

  const stats = useMemo(() => {
    const spentDays = dailyUsage.filter((day) => !day.isFuture);
    const total = spentDays.reduce((sum, day) => sum + day.spent, 0);
    const average = spentDays.length > 0 ? roundCurrency(total / spentDays.length) : 0;

    const worst = spentDays.reduce<(typeof spentDays)[number] | null>(
      (max, day) => (max === null || day.spent > max.spent ? day : max),
      null,
    );

    const last = lastActualIndex >= 0 ? burnSeries[lastActualIndex] : undefined;
    const drift = last && last.actual !== null ? roundCurrency(last.actual - last.ideal) : 0;

    return { average, worst, drift, total: roundCurrency(total) };
  }, [dailyUsage, burnSeries, lastActualIndex]);

  const maxCategory = categoryTotals[0]?.total ?? 0;

  if (!isReady || !snapshot) {
    return (
      <main className="min-h-[100dvh] px-4 pt-safe">
        <div className="h-10 w-1/2 animate-pulse rounded-lg bg-zinc-900" />
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-zinc-900" />
        <div className="mt-4 h-48 animate-pulse rounded-2xl bg-zinc-900" />
      </main>
    );
  }

  const isAhead = stats.drift > 0;

  return (
    <main className="min-h-[100dvh] px-4 pt-safe">
      <header className="pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Analítica</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Tu quema real contra el ritmo que aguanta la semana.
        </p>
      </header>

      {/* Titular: ritmo real vs ideal */}
      <Card className="p-4">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          Ritmo de quema
        </p>
        <div className="mt-1.5 flex items-end gap-2">
          <span
            className={cn(
              'text-3xl font-bold tabular-nums leading-none tracking-tight',
              isAhead ? 'text-rose-400' : 'text-emerald-400',
            )}
          >
            {isAhead ? '+' : ''}
            {formatCurrency(stats.drift, symbol)}
          </span>
          <span
            className={cn(
              'flex items-center gap-1 pb-0.5 text-xs font-medium',
              isAhead ? 'text-rose-400' : 'text-emerald-400',
            )}
          >
            {isAhead ? (
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.4} />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.4} />
            )}
            {isAhead ? 'Arriba del ideal' : 'Abajo del ideal'}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-zinc-600">
          Ideal acumulado hoy:{' '}
          {formatCurrency(burnSeries[Math.max(0, lastActualIndex)]?.ideal ?? 0, symbol)}
        </p>
      </Card>

      {/* Gráfico de quema */}
      <section className="mt-6">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Quema acumulada
          </h2>
          <button
            type="button"
            onClick={() => setShowTable((value) => !value)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            {showTable ? (
              <>
                <BarChart3 className="h-3.5 w-3.5" strokeWidth={2.3} />
                Gráfica
              </>
            ) : (
              <>
                <Table2 className="h-3.5 w-3.5" strokeWidth={2.3} />
                Tabla
              </>
            )}
          </button>
        </div>

        <Card className="p-4">
          {/* Leyenda: la identidad nunca depende sólo del color. */}
          <ul className="mb-3 flex items-center gap-4">
            <li className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span
                aria-hidden="true"
                className="h-0.5 w-4 rounded-full"
                style={{ backgroundColor: CHART_COLORS.actual }}
              />
              Real
            </li>
            <li className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span
                aria-hidden="true"
                className="h-0.5 w-4 rounded-full"
                style={{
                  backgroundImage: `repeating-linear-gradient(to right, ${CHART_COLORS.ideal} 0 4px, transparent 4px 7px)`,
                }}
              />
              Ideal
            </li>
          </ul>

          {showTable ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">
                  Gasto acumulado real contra el ideal, por día del ciclo
                </caption>
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th scope="col" className="pb-2 font-medium">Día</th>
                    <th scope="col" className="pb-2 text-right font-medium">Del día</th>
                    <th scope="col" className="pb-2 text-right font-medium">Real</th>
                    <th scope="col" className="pb-2 text-right font-medium">Ideal</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {burnSeries.map((point) => (
                    <tr key={point.dateKey} className="border-t border-zinc-800/70">
                      <th scope="row" className="py-2 text-left font-medium text-zinc-400">
                        D{point.day}
                        {point.isToday ? (
                          <span className="ml-1 text-[10px] text-emerald-400">hoy</span>
                        ) : null}
                      </th>
                      <td className="py-2 text-right text-zinc-500">
                        {point.daily === null ? '—' : formatCurrency(point.daily, symbol)}
                      </td>
                      <td className="py-2 text-right font-semibold text-zinc-200">
                        {point.actual === null ? '—' : formatCurrency(point.actual, symbol)}
                      </td>
                      <td className="py-2 text-right text-zinc-500">
                        {formatCurrency(point.ideal, symbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={burnSeries}
                  margin={{ top: 8, right: 12, bottom: 0, left: -8 }}
                >
                  <defs>
                    <linearGradient id="burn-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.actual} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={CHART_COLORS.actual} stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  {/* Rejilla recesiva: hairline sólida, sólo horizontal. */}
                  <CartesianGrid
                    stroke={CHART_COLORS.grid}
                    strokeWidth={1}
                    vertical={false}
                  />

                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
                    dy={4}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
                    tickFormatter={(value: number) => formatCompactCurrency(value, symbol)}
                  />

                  <Tooltip
                    cursor={{ stroke: CHART_COLORS.axis, strokeWidth: 1 }}
                    content={<BurnTooltip currencySymbol={symbol} />}
                  />

                  {/* Referencia ideal: discontinua + etiqueta en la leyenda. */}
                  <Line
                    type="linear"
                    dataKey="ideal"
                    stroke={CHART_COLORS.ideal}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />

                  <Area
                    type="monotone"
                    dataKey="actual"
                    stroke="none"
                    fill="url(#burn-area)"
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke={CHART_COLORS.actual}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    connectNulls={false}
                    // Marcador sólo en el último punto real, con anillo del
                    // color de la superficie para que no se pierda al cruzar.
                    dot={(props: {
                      cx?: number;
                      cy?: number;
                      index?: number;
                      key?: React.Key | null;
                    }) => {
                      const { cx, cy, index, key } = props;
                      const dotKey = key ?? `dot-${String(index)}`;
                      if (index !== lastActualIndex || cx === undefined || cy === undefined) {
                        return <g key={dotKey} />;
                      }
                      return (
                        <circle
                          key={dotKey}
                          cx={cx}
                          cy={cy}
                          r={4.5}
                          fill={CHART_COLORS.actual}
                          stroke="#18181b"
                          strokeWidth={2}
                        />
                      );
                    }}
                    activeDot={{ r: 5, fill: CHART_COLORS.actual, stroke: '#18181b', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </section>

      {/* Reparto por categoría */}
      <section className="mt-6">
        <h2 className="mb-2.5 text-xs font-medium uppercase tracking-widest text-zinc-500">
          En qué se fue
        </h2>

        <Card className="p-4">
          {categoryTotals.length === 0 ? (
            <p className="py-3 text-center text-sm text-zinc-500">
              Sin movimientos registrados esta semana.
            </p>
          ) : (
            <ul className="space-y-3.5">
              {categoryTotals.map((entry) => {
                const width = maxCategory > 0 ? (entry.total / maxCategory) * 100 : 0;

                return (
                  <li key={entry.category}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2 text-xs font-medium text-zinc-300">
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: CATEGORY_COLORS[entry.category] }}
                        />
                        {CATEGORY_LABELS[entry.category]}
                        <span className="text-zinc-600">
                          ({entry.count} {entry.count === 1 ? 'registro' : 'registros'})
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-zinc-200">
                        {formatCurrency(entry.total, symbol)}
                      </span>
                    </div>

                    {/* Barra <=24px, extremo redondeado 4px, anclada a la base. */}
                    <div className="h-2.5 w-full overflow-hidden rounded-l-sm bg-zinc-800/60">
                      <div
                        className="h-full rounded-r-[4px] transition-[width] duration-500 ease-out"
                        style={{
                          width: `${Math.max(width, 2)}%`,
                          backgroundColor: CATEGORY_COLORS[entry.category],
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      {/* Tarjetas de apoyo */}
      <section className="mt-4 grid grid-cols-2 gap-2.5">
        <Card className="p-3.5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Promedio diario
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-zinc-100">
            {formatCurrency(stats.average, symbol)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">
            ideal {formatCurrency(snapshot.idealDailyBurn, symbol)}
          </p>
        </Card>

        <Card className="p-3.5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Día más caro
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-zinc-100">
            {stats.worst ? formatCurrency(stats.worst.spent, symbol) : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-600">
            {stats.worst ? `Día ${stats.worst.day} del ciclo` : 'Sin datos'}
          </p>
        </Card>
      </section>
    </main>
  );
}

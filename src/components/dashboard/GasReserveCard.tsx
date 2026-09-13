'use client';

import { Fuel } from 'lucide-react';

import { Card } from '@/components/ui/card';
import type { GasBreakdown } from '@/lib/budgetEngine';
import { cn, formatCurrency } from '@/lib/utils';

interface GasReserveCardProps {
  gas: GasBreakdown;
  currencySymbol: string;
  className?: string;
}

const SEGMENTS = 12;

/**
 * Medidor del tanque presupuestal. Se dibuja por segmentos (no como barra
 * continua) para que se lea como el indicador de gasolina de un tablero.
 */
export function GasReserveCard({ gas, currencySymbol, className }: GasReserveCardProps) {
  const remainingRatio = gas.reserve > 0 ? gas.remaining / gas.reserve : 0;
  const litSegments = Math.ceil(remainingRatio * SEGMENTS);
  const isLow = remainingRatio <= 0.25;
  const isEmpty = gas.remaining <= 0;

  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              isEmpty ? 'bg-rose-500/15 text-rose-400' : 'bg-sky-500/15 text-sky-400',
            )}
          >
            <Fuel className="h-4 w-4" strokeWidth={2.3} />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Combustible apartado
            </p>
            <p
              className={cn(
                'text-lg font-bold tabular-nums tracking-tight',
                isEmpty ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-zinc-50',
              )}
            >
              {formatCurrency(gas.remaining, currencySymbol)}
              <span className="ml-1 text-xs font-normal text-zinc-600">
                de {formatCurrency(gas.reserve, currencySymbol)}
              </span>
            </p>
          </div>
        </div>

        <span className="text-right text-[11px] leading-tight text-zinc-600">
          {formatCurrency(gas.spent, currencySymbol)}
          <br />
          cargados
        </span>
      </div>

      <div className="mt-3.5 flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-2.5 flex-1 rounded-sm transition-colors duration-500',
              index < litSegments
                ? isLow
                  ? 'bg-amber-400'
                  : 'bg-sky-400'
                : 'bg-zinc-800',
            )}
          />
        ))}
      </div>

      {gas.overflow > 0 ? (
        <p className="mt-3 text-xs font-medium text-rose-400">
          Reserva agotada: {formatCurrency(gas.overflow, currencySymbol)} de gasolina ya están
          comiéndose tu cupo de comida.
        </p>
      ) : isLow ? (
        <p className="mt-3 text-xs text-amber-400/90">
          Queda poco tanque presupuestal. Lo que cargues de más saldrá del cupo diario.
        </p>
      ) : (
        <p className="mt-3 text-xs text-zinc-600">
          Este dinero está blindado: cargar gasolina no baja tu cupo de comida.
        </p>
      )}
    </Card>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Fuel, PiggyBank, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BudgetSnapshot } from '@/lib/budgetEngine';
import { cn, formatCurrency, roundCurrency, safeNumber } from '@/lib/utils';

export interface CycleResetValues {
  totalIncome: number;
  gasReserve: number;
  fixedExpenses: number;
}

interface CycleResetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: BudgetSnapshot | null;
  currencySymbol: string;
  defaults: CycleResetValues;
  onConfirm: (values: CycleResetValues) => void | Promise<void>;
}

/**
 * Cierra la semana en curso y abre la siguiente. Muestra primero qué sobró —el
 * refuerzo positivo de haber llegado al domingo con dinero— y sólo después pide
 * las cifras del ciclo nuevo.
 */
export function CycleResetModal({
  open,
  onOpenChange,
  snapshot,
  currencySymbol,
  defaults,
  onConfirm,
}: CycleResetModalProps) {
  const [income, setIncome] = useState(String(defaults.totalIncome));
  const [gas, setGas] = useState(String(defaults.gasReserve));
  const [fixed, setFixed] = useState(String(defaults.fixedExpenses));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setIncome(String(defaults.totalIncome));
      setGas(String(defaults.gasReserve));
      setFixed(String(defaults.fixedExpenses));
      setIsSaving(false);
    }
  }, [open, defaults.totalIncome, defaults.gasReserve, defaults.fixedExpenses]);

  const leftover = snapshot ? Math.max(0, snapshot.remainingBalance) : 0;
  const gasLeftover = snapshot ? snapshot.gas.remaining : 0;
  const rescued = roundCurrency(leftover + gasLeftover);

  const parsedIncome = Math.max(0, roundCurrency(safeNumber(income)));
  const parsedGas = Math.max(0, roundCurrency(safeNumber(gas)));
  const parsedFixed = Math.max(0, roundCurrency(safeNumber(fixed)));
  const operating = roundCurrency(parsedIncome - parsedGas - parsedFixed);
  const isValid = parsedIncome > 0 && operating >= 0;

  const handleConfirm = async () => {
    if (!isValid || isSaving) return;
    setIsSaving(true);
    try {
      await onConfirm({
        totalIncome: parsedIncome,
        gasReserve: parsedGas,
        fixedExpenses: parsedFixed,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-emerald-400" strokeWidth={2.4} />
            Cerrar semana
          </DialogTitle>
          <DialogDescription>
            Se archiva el ciclo actual y arranca uno nuevo de 7 días desde hoy.
          </DialogDescription>
        </DialogHeader>

        {snapshot ? (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                <PiggyBank className="h-3.5 w-3.5" strokeWidth={2.3} />
                Sobró del cupo
              </span>
              <p
                className={cn(
                  'mt-1.5 text-xl font-bold tabular-nums tracking-tight',
                  leftover > 0 ? 'text-emerald-400' : 'text-zinc-500',
                )}
              >
                {formatCurrency(leftover, currencySymbol)}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                <Fuel className="h-3.5 w-3.5" strokeWidth={2.3} />
                Gasolina sin usar
              </span>
              <p
                className={cn(
                  'mt-1.5 text-xl font-bold tabular-nums tracking-tight',
                  gasLeftover > 0 ? 'text-sky-400' : 'text-zinc-500',
                )}
              >
                {formatCurrency(gasLeftover, currencySymbol)}
              </p>
            </div>

            {rescued > 0 ? (
              <p className="col-span-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-300">
                Rescataste {formatCurrency(rescued, currencySymbol)} de esta semana. Ese dinero no
                se arrastra al cupo nuevo: sepáralo como ahorro real.
              </p>
            ) : (
              <p className="col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-xs text-zinc-500">
                Esta semana cerró en ceros. El ciclo nuevo arranca limpio.
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-5 space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="reset-income">Ingreso de la semana</Label>
            <Input
              id="reset-income"
              inputMode="decimal"
              value={income}
              onChange={(event) => setIncome(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reset-gas">Reserva de gasolina</Label>
            <Input
              id="reset-gas"
              inputMode="decimal"
              value={gas}
              onChange={(event) => setGas(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reset-fixed">Gastos fijos de la semana</Label>
            <Input
              id="reset-fixed"
              inputMode="decimal"
              value={fixed}
              onChange={(event) => setFixed(event.target.value)}
            />
          </div>

          <div
            className={cn(
              'flex items-center justify-between rounded-xl border px-3.5 py-3',
              isValid
                ? 'border-zinc-800 bg-zinc-900/60'
                : 'border-rose-500/30 bg-rose-500/10',
            )}
          >
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Cupo diario nuevo
            </span>
            <span
              className={cn(
                'flex items-center gap-1.5 text-lg font-bold tabular-nums',
                isValid ? 'text-emerald-400' : 'text-rose-400',
              )}
            >
              {formatCurrency(isValid ? operating / 7 : 0, currencySymbol)}
              <ArrowRight className="h-4 w-4 text-zinc-600" strokeWidth={2.4} />
            </span>
          </div>

          {!isValid ? (
            <p className="text-xs text-rose-400">
              La reserva y los fijos no pueden superar el ingreso de la semana.
            </p>
          ) : null}
        </div>

        <DialogFooter className="mt-5">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="success"
            disabled={!isValid || isSaving}
            onClick={() => void handleConfirm()}
          >
            {isSaving ? 'Iniciando…' : 'Iniciar semana nueva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

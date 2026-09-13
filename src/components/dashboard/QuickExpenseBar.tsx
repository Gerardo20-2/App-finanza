'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Coffee, Fuel, ShoppingBasket, UtensilsCrossed } from 'lucide-react';

import { cn, formatCompactCurrency } from '@/lib/utils';
import type { ExpenseCategory } from '@/lib/budgetEngine';

export interface QuickAction {
  amount: number;
  label: string;
  category: ExpenseCategory;
  icon: typeof Coffee;
  accent: string;
}

/** Los cuatro gastos que el usuario repite semana con semana. */
export const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    amount: 35,
    label: 'Comida calle',
    category: 'comida',
    icon: Coffee,
    accent: 'text-emerald-400',
  },
  {
    amount: 65,
    label: 'Menú corrida',
    category: 'comida',
    icon: UtensilsCrossed,
    accent: 'text-emerald-400',
  },
  {
    amount: 100,
    label: 'Súper mini',
    category: 'super',
    icon: ShoppingBasket,
    accent: 'text-violet-400',
  },
  {
    amount: 150,
    label: 'Gasolina',
    category: 'combustible',
    icon: Fuel,
    accent: 'text-sky-400',
  },
] as const;

interface QuickExpenseBarProps {
  currencySymbol: string;
  onQuickExpense: (action: QuickAction) => void | Promise<void>;
  disabled?: boolean;
}

/**
 * Registro de un toque. La gasolina se descuenta de la reserva apartada, no del
 * cupo de comida — el motor lo resuelve por categoría.
 */
export function QuickExpenseBar({
  currencySymbol,
  onQuickExpense,
  disabled = false,
}: QuickExpenseBarProps) {
  const [pending, setPending] = useState<number | null>(null);

  const handleTap = async (action: QuickAction, index: number) => {
    if (disabled || pending !== null) return;
    setPending(index);
    try {
      await onQuickExpense(action);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {QUICK_ACTIONS.map((action, index) => {
        const Icon = action.icon;
        const isPending = pending === index;

        return (
          <motion.button
            key={`${action.label}-${action.amount}`}
            type="button"
            disabled={disabled}
            onClick={() => void handleTap(action, index)}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={cn(
              'group relative flex flex-col items-start gap-1 overflow-hidden rounded-2xl border p-3.5 text-left transition-colors',
              'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 hover:bg-zinc-800/70',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600',
              'disabled:pointer-events-none disabled:opacity-40',
              isPending && 'border-zinc-600',
            )}
          >
            <span className="flex w-full items-center justify-between">
              <Icon className={cn('h-4 w-4', action.accent)} strokeWidth={2.3} />
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                1 toque
              </span>
            </span>
            <span className="text-xl font-bold tabular-nums tracking-tight text-zinc-50">
              +{formatCompactCurrency(action.amount, currencySymbol)}
            </span>
            <span className="text-xs text-zinc-500">{action.label}</span>

            {action.category === 'combustible' ? (
              <span className="mt-0.5 text-[10px] font-medium text-sky-400/80">
                Sale de la reserva
              </span>
            ) : null}
          </motion.button>
        );
      })}
    </div>
  );
}

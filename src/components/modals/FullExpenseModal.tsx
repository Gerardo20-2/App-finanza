'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Coffee,
  Delete,
  Fuel,
  PartyPopper,
  ShoppingBasket,
  Siren,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { BudgetSnapshot, ExpenseCategory } from '@/lib/budgetEngine';
import { cn, formatCurrency, roundCurrency } from '@/lib/utils';

const CATEGORIES: ReadonlyArray<{
  value: ExpenseCategory;
  label: string;
  icon: typeof Coffee;
  active: string;
}> = [
  { value: 'comida', label: 'Comida', icon: Coffee, active: 'border-emerald-500 bg-emerald-500/15 text-emerald-300' },
  { value: 'combustible', label: 'Gasolina', icon: Fuel, active: 'border-sky-500 bg-sky-500/15 text-sky-300' },
  { value: 'super', label: 'Súper', icon: ShoppingBasket, active: 'border-violet-500 bg-violet-500/15 text-violet-300' },
  { value: 'gustos', label: 'Gustos', icon: PartyPopper, active: 'border-amber-400 bg-amber-400/15 text-amber-300' },
  { value: 'urgencia', label: 'Urgencia', icon: Siren, active: 'border-rose-500 bg-rose-500/15 text-rose-300' },
] as const;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

export interface FullExpenseSubmit {
  amount: number;
  category: ExpenseCategory;
  note?: string;
}

interface FullExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: BudgetSnapshot | null;
  currencySymbol: string;
  onSubmit: (input: FullExpenseSubmit) => void | Promise<void>;
  /** Feedback táctil/sonoro de cada tecla. */
  onKeyFeedback?: () => void;
}

/** Acepta hasta 2 decimales y un solo punto. */
function applyKey(current: string, key: string): string {
  if (key === 'del') return current.length <= 1 ? '' : current.slice(0, -1);
  if (key === '.') return current.includes('.') ? current : `${current === '' ? '0' : current}.`;

  const [, decimals] = current.split('.');
  if (decimals !== undefined && decimals.length >= 2) return current;
  if (current === '0') return key;
  if (current.replace('.', '').length >= 7) return current;

  return current + key;
}

/**
 * Teclado numérico a pantalla completa. Las teclas viven en la mitad inferior
 * y miden 64px de alto para que el pulgar acierte sin mirar.
 */
export function FullExpenseModal({
  open,
  onOpenChange,
  snapshot,
  currencySymbol,
  onSubmit,
  onKeyFeedback,
}: FullExpenseModalProps) {
  const [raw, setRaw] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('comida');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Cada apertura arranca limpia: nunca se arrastra el monto anterior.
  useEffect(() => {
    if (open) {
      setRaw('');
      setCategory('comida');
      setNote('');
      setIsSaving(false);
    }
  }, [open]);

  const amount = useMemo(() => {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? roundCurrency(parsed) : 0;
  }, [raw]);

  const projection = useMemo(() => {
    if (!snapshot) return null;

    if (category === 'combustible') {
      const fromReserve = Math.min(amount, snapshot.gas.remaining);
      return {
        label: 'Reserva de gasolina',
        after: roundCurrency(snapshot.gas.remaining - fromReserve),
        overflow: roundCurrency(amount - fromReserve),
        isNegative: false,
      };
    }

    const after = roundCurrency(snapshot.availableToday - amount);
    return { label: 'Te quedaría hoy', after, overflow: 0, isNegative: after < 0 };
  }, [snapshot, amount, category]);

  const handleKey = (key: string) => {
    onKeyFeedback?.();
    setRaw((current) => applyKey(current, key));
  };

  const handleSubmit = async () => {
    if (amount <= 0 || isSaving) return;
    setIsSaving(true);
    try {
      await onSubmit({ amount, category, ...(note.trim() ? { note: note.trim() } : {}) });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullscreen className="gap-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle>Registrar gasto</DialogTitle>
          <DialogDescription>
            Marca la categoría y teclea el monto exacto.
          </DialogDescription>
        </DialogHeader>

        {/* Monto */}
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-3">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-light text-zinc-600">{currencySymbol}</span>
            <span
              className={cn(
                'text-6xl font-bold tabular-nums leading-none tracking-tight',
                raw === '' ? 'text-zinc-700' : 'text-zinc-50',
              )}
            >
              {raw === '' ? '0' : raw}
            </span>
          </div>

          <AnimatePresence mode="wait">
            {projection && amount > 0 ? (
              <motion.p
                key={`${projection.label}-${projection.after}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  'mt-2.5 text-sm font-medium tabular-nums',
                  projection.isNegative || projection.overflow > 0
                    ? 'text-rose-400'
                    : 'text-zinc-500',
                )}
              >
                {projection.label}:{' '}
                {formatCurrency(Math.max(0, projection.after), currencySymbol)}
                {projection.overflow > 0
                  ? ` · ${formatCurrency(projection.overflow, currencySymbol)} saldrían del cupo`
                  : ''}
              </motion.p>
            ) : (
              <p className="mt-2.5 text-sm text-zinc-700">Teclea el monto</p>
            )}
          </AnimatePresence>
        </div>

        {/* Categorías */}
        <div className="flex flex-wrap justify-center gap-2 px-5 pb-3">
          {CATEGORIES.map(({ value, label, icon: Icon, active }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                onKeyFeedback?.();
                setCategory(value);
              }}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors',
                category === value
                  ? active
                  : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300',
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2.3} />
              {label}
            </button>
          ))}
        </div>

        <div className="px-5 pb-3">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Nota (opcional)"
            maxLength={60}
            className="h-11 text-sm"
          />
        </div>

        {/* Teclado */}
        <div className="grid grid-cols-3 gap-2 px-5 pb-3">
          {KEYS.map((key) => (
            <motion.button
              key={key}
              type="button"
              whileTap={{ scale: 0.93 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
              onClick={() => handleKey(key)}
              className={cn(
                'flex h-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900',
                'text-2xl font-semibold text-zinc-100 transition-colors active:bg-zinc-800',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600',
                key === 'del' && 'text-zinc-400',
              )}
              aria-label={key === 'del' ? 'Borrar' : key}
            >
              {key === 'del' ? <Delete className="h-6 w-6" strokeWidth={2} /> : key}
            </motion.button>
          ))}
        </div>

        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <Button
            variant={amount > 0 ? 'success' : 'secondary'}
            size="lg"
            className="w-full text-base"
            disabled={amount <= 0 || isSaving}
            onClick={() => void handleSubmit()}
          >
            {isSaving ? 'Guardando…' : `Registrar ${formatCurrency(amount, currencySymbol)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

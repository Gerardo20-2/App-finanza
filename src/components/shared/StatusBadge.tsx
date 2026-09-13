'use client';

import { AlertTriangle, ShieldCheck, Skull, TrendingDown } from 'lucide-react';

import { STATUS_META, type BudgetStatus } from '@/lib/budgetEngine';
import { cn } from '@/lib/utils';

const ICONS = {
  healthy: ShieldCheck,
  caution: TrendingDown,
  critical: AlertTriangle,
  survival: Skull,
} as const satisfies Record<BudgetStatus, unknown>;

interface StatusBadgeProps {
  status: BudgetStatus;
  label?: string;
  className?: string;
}

/** Semáforo: verde (>50% del cupo), ámbar, rojo y supervivencia. */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  const Icon = ICONS[status];

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
        meta.tone,
        status === 'survival' && 'animate-pulse-danger',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
      {label ?? meta.label}
    </span>
  );
}

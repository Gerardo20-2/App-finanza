'use client';

import * as React from 'react';

import { clamp, cn } from '@/lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..1 */
  value: number;
  indicatorClassName?: string;
}

/**
 * Barra de progreso ligera. No usa Radix a propósito: aquí sólo se necesita
 * una pista y un relleno animado por CSS, y el `role="progressbar"` nativo ya
 * cubre la accesibilidad.
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, indicatorClassName, ...props }, ref) => {
    const percent = clamp(value, 0, 1) * 100;

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className={cn('h-2 w-full overflow-hidden rounded-full bg-zinc-800', className)}
        {...props}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out', indicatorClassName)}
          style={{ width: `${percent}%` }}
        />
      </div>
    );
  },
);
Progress.displayName = 'Progress';

export { Progress };

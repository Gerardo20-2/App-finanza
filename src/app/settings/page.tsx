'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Volume2, Vibrate } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import { useHapticSound } from '@/hooks/useHapticSound';
import { useWeeklyBudget } from '@/hooks/useWeeklyBudget';
import { resolveCycleRange, wipeAllData } from '@/lib/db';
import {
  cn,
  formatCurrency,
  formatDateRange,
  roundCurrency,
  safeNumber,
  WEEKDAY_NAMES,
} from '@/lib/utils';

export default function SettingsPage() {
  const { isReady, settings, cycle, snapshot, saveSettings, updateCycle, now } =
    useWeeklyBudget();
  const { play } = useHapticSound({
    sound: settings.soundFeedback,
    haptics: settings.hapticFeedback,
  });

  const [income, setIncome] = useState('');
  const [gas, setGas] = useState('');
  const [fixed, setFixed] = useState('');
  const [symbol, setSymbol] = useState('$');
  const [savedAt, setSavedAt] = useState(0);
  const [isWipeOpen, setWipeOpen] = useState(false);

  // Hidrata los campos una vez que IndexedDB responde.
  useEffect(() => {
    if (!isReady || !cycle) return;
    setIncome(String(cycle.totalIncome));
    setGas(String(cycle.gasReserve));
    setFixed(String(cycle.fixedExpenses));
    setSymbol(settings.currencySymbol);
  }, [isReady, cycle, settings.currencySymbol]);

  const parsedIncome = Math.max(0, roundCurrency(safeNumber(income)));
  const parsedGas = Math.max(0, roundCurrency(safeNumber(gas)));
  const parsedFixed = Math.max(0, roundCurrency(safeNumber(fixed)));
  const operating = roundCurrency(parsedIncome - parsedGas - parsedFixed);
  const isValid = parsedIncome > 0 && operating >= 0;

  const handleSaveCycle = async () => {
    if (!isValid) return;
    await updateCycle({
      totalIncome: parsedIncome,
      gasReserve: parsedGas,
      fixedExpenses: parsedFixed,
    });
    await saveSettings({
      defaultWeeklyIncome: parsedIncome,
      defaultGasReserve: parsedGas,
      defaultFixedExpenses: parsedFixed,
      currencySymbol: symbol.trim().slice(0, 3) || '$',
    });
    play('success');
    setSavedAt(Date.now());
  };

  /** Cambiar el día de pago sólo reencuadra el ciclo que está corriendo. */
  const handleStartDay = async (dayIndex: number) => {
    play('tap');
    await saveSettings({ cycleStartDay: dayIndex });

    if (cycle?.status === 'active') {
      const range = resolveCycleRange(dayIndex, now);
      await updateCycle(range);
    }
  };

  const handleWipe = async () => {
    await wipeAllData();
    play('error');
    setWipeOpen(false);
    window.location.href = '/';
  };

  if (!isReady) {
    return (
      <main className="min-h-[100dvh] px-4 pt-safe">
        <div className="h-10 w-1/2 animate-pulse rounded-lg bg-zinc-900" />
        <div className="mt-6 space-y-3">
          <div className="h-40 animate-pulse rounded-2xl bg-zinc-900" />
          <div className="h-52 animate-pulse rounded-2xl bg-zinc-900" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] px-4 pt-safe">
      <header className="pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Ajustes</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Configura tu ciclo de pago y cuánto entra cada semana.
        </p>
      </header>

      {/* Día de pago */}
      <section className="mb-6">
        <h2 className="mb-2.5 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Día de pago
        </h2>
        <Card className="p-4">
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAY_NAMES.map((name, index) => (
              <button
                key={name}
                type="button"
                onClick={() => void handleStartDay(index)}
                aria-pressed={settings.cycleStartDay === index}
                aria-label={name}
                className={cn(
                  'flex h-11 items-center justify-center rounded-xl border text-xs font-bold transition-colors',
                  settings.cycleStartDay === index
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-200',
                )}
              >
                {name.slice(0, 1)}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs text-zinc-500">
            El ciclo dura 7 días y arranca cada{' '}
            <span className="font-medium text-zinc-300">
              {WEEKDAY_NAMES[settings.cycleStartDay] ?? 'Lunes'}
            </span>
            {cycle ? (
              <>
                {'. '}Ciclo actual:{' '}
                <span className="font-medium text-zinc-300">
                  {formatDateRange(cycle.startDate, cycle.endDate)}
                </span>
              </>
            ) : null}
          </p>
        </Card>
      </section>

      {/* Dinero */}
      <section className="mb-6">
        <h2 className="mb-2.5 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Dinero de la semana
        </h2>
        <Card className="space-y-3.5 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="income">Ingreso semanal</Label>
            <Input
              id="income"
              inputMode="decimal"
              value={income}
              onChange={(event) => setIncome(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gas">Reserva de gasolina</Label>
            <Input
              id="gas"
              inputMode="decimal"
              value={gas}
              onChange={(event) => setGas(event.target.value)}
            />
            <p className="text-[11px] leading-snug text-zinc-600">
              Dinero blindado: los gastos de combustible salen de aquí y no tocan tu cupo de
              comida hasta que se agote.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fixed">Gastos fijos de la semana</Label>
            <Input
              id="fixed"
              inputMode="decimal"
              value={fixed}
              onChange={(event) => setFixed(event.target.value)}
            />
            <p className="text-[11px] leading-snug text-zinc-600">
              Renta prorrateada, datos, suscripciones. Se descuentan antes de repartir el cupo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="symbol">Símbolo de moneda</Label>
            <Input
              id="symbol"
              value={symbol}
              maxLength={3}
              onChange={(event) => setSymbol(event.target.value)}
              className="w-24"
            />
          </div>

          <div
            className={cn(
              'flex items-center justify-between rounded-xl border px-3.5 py-3',
              isValid ? 'border-zinc-800 bg-zinc-950/60' : 'border-rose-500/30 bg-rose-500/10',
            )}
          >
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Cupo diario
            </span>
            <span
              className={cn(
                'text-lg font-bold tabular-nums',
                isValid ? 'text-emerald-400' : 'text-rose-400',
              )}
            >
              {formatCurrency(isValid ? operating / 7 : 0, symbol || '$')}
            </span>
          </div>

          {!isValid ? (
            <p className="text-xs text-rose-400">
              La reserva y los fijos no pueden superar el ingreso semanal.
            </p>
          ) : null}

          <Button
            variant="success"
            className="w-full"
            disabled={!isValid}
            onClick={() => void handleSaveCycle()}
          >
            {Date.now() - savedAt < 2500 ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2.6} />
                Guardado
              </>
            ) : (
              'Guardar cambios'
            )}
          </Button>
        </Card>
      </section>

      {/* Feedback */}
      <section className="mb-6">
        <h2 className="mb-2.5 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Feedback
        </h2>
        <Card className="divide-y divide-zinc-800">
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <Volume2 className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={2.2} />
              <div>
                <p className="text-sm font-medium text-zinc-200">Sonido</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">
                  Clic al registrar, golpe sordo al pasarte.
                </p>
              </div>
            </div>
            <Switch
              checked={settings.soundFeedback}
              onCheckedChange={(checked) => {
                void saveSettings({ soundFeedback: checked });
                if (checked) play('success');
              }}
              aria-label="Sonido"
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <Vibrate className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={2.2} />
              <div>
                <p className="text-sm font-medium text-zinc-200">Vibración</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">
                  Confirmación háptica en cada toque.
                </p>
              </div>
            </div>
            <Switch
              checked={settings.hapticFeedback}
              onCheckedChange={(checked) => {
                void saveSettings({ hapticFeedback: checked });
                if (checked) play('tap');
              }}
              aria-label="Vibración"
            />
          </div>
        </Card>
      </section>

      {/* Zona peligrosa */}
      <section className="mb-4">
        <h2 className="mb-2.5 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Datos
        </h2>
        <Card className="border-rose-500/25 p-4">
          <p className="text-sm text-zinc-300">Borrar todo</p>
          <p className="mt-1 text-[11px] leading-snug text-zinc-600">
            Elimina ciclos, movimientos y ajustes de este dispositivo. Los datos viven sólo
            aquí: no hay copia en la nube y no se puede deshacer.
          </p>
          <Button variant="danger" className="mt-3 w-full" onClick={() => setWipeOpen(true)}>
            Borrar todos mis datos
          </Button>
        </Card>
      </section>

      {snapshot ? (
        <p className="pb-2 text-center text-[11px] text-zinc-700">
          Saldo del ciclo: {formatCurrency(snapshot.remainingBalance, symbol || '$')} ·{' '}
          {snapshot.progress.daysRemaining} días restantes
        </p>
      ) : null}

      <Dialog open={isWipeOpen} onOpenChange={setWipeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" strokeWidth={2.4} />
              ¿Borrar todo?
            </DialogTitle>
            <DialogDescription>
              Se eliminarán todas tus semanas y movimientos de este dispositivo. Esta acción no
              se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-5">
            <Button variant="ghost" onClick={() => setWipeOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void handleWipe()}>
              Sí, borrar todo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

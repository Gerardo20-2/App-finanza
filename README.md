# WeeklyBurn

PWA offline-first para controlar el **cupo diario real** de una persona con ingresos
semanales, no para registrar gastos pasados.

> ¿Cuánto dinero puedo gastar hoy sin quedarme sin comer ni sin gasolina el fin de semana?

## Stack

Next.js 15 (App Router) · TypeScript estricto · Dexie.js (IndexedDB) · Tailwind CSS ·
Radix/shadcn · Framer Motion · Recharts · Lucide · date-fns · Web Audio API.

## Arranque

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # build de producción
npm test           # 42 pruebas del motor financiero
npm run typecheck  # tsc --noEmit
```

## Matemática del presupuesto

Para cada día `t` del ciclo de 7 días:

```
Presupuesto_Operativo = Ingreso_Semanal − Reserva_Gasolina − Gastos_Fijos
Saldo_Restante        = Presupuesto_Operativo − Gastos_Variables_Acumulados
Cupo_Hoy              = Saldo_al_inicio_del_día ÷ Días_Restantes_del_Ciclo
```

El cupo se fija con el saldo al **arranque** del día: gastar hoy no encoge el cupo de
hoy (se ve drenar la barra), sino el de los días siguientes. De ahí sale el rollover:

- **Subgasto** — cupo $180, gastas $100 → los $80 suben el cupo de los días que faltan.
- **Sobregasto** — cupo $180, gastas $250 → los $70 bajan el cupo de los días que faltan.
- **Ruina** (`Saldo ≤ 0`) → Modo Supervivencia: cupo $0, fondo carmesí y sugerencias de
  comidas de ultra bajo costo.

### La reserva de gasolina

La reserva se aparta **completa** durante todo el ciclo y el gasto de combustible sólo
consume cupo diario cuando **rebasa** esa reserva. Es el equivalente algebraico de la
formulación `Ingreso − Reserva_Restante − Fijos` contando la gasolina íntegra dentro
del gasto variable —

```
I − (R − G) − F − (V + G)  ≡  I − R − F − V
```

— pero deja el presupuesto operativo estable toda la semana en vez de brincar cada vez
que cargas gasolina. Cargar el tanque nunca baja tu cupo de comida hasta que la reserva
se agota.

## Arquitectura

```
src/
├── app/            # Rutas: dashboard, historial, analítica, ajustes
├── components/
│   ├── dashboard/  # DailyBurnGauge, QuickExpenseBar, GasReserveCard, SprintDayDots
│   ├── modals/     # FullExpenseModal (teclado táctil), CycleResetModal
│   ├── shared/     # BottomNav, StatusBadge, ServiceWorkerProvider
│   └── ui/         # Primitivas shadcn/ui sobre Radix
├── hooks/
│   ├── useWeeklyBudget.ts  # Estado reactivo sobre Dexie (useLiveQuery)
│   └── useHapticSound.ts   # Tonos sintetizados + vibración
└── lib/
    ├── db.ts             # Esquema y acceso a IndexedDB
    ├── budgetEngine.ts   # Lógica pura y determinista
    └── utils.ts          # Moneda es-MX, fechas locales, saneamiento numérico
```

`budgetEngine.ts` no importa Dexie ni React y nunca lee el reloj por su cuenta: la fecha
de referencia siempre entra como parámetro. Por eso se puede probar sin navegador y
recalcular en cada render sin efectos colaterales.

### Notas de implementación

- **`useLiveQuery` es de sólo lectura.** Las consultas reactivas de Dexie corren dentro
  de una transacción de lectura; sembrar ajustes o crear el primer ciclo se hace en un
  efecto de montaje (`bootstrap`), nunca dentro de la consulta.
- **Fechas en local, no en UTC.** `new Date('2026-09-13')` se interpreta como medianoche
  UTC y cae en el día anterior en cualquier huso negativo. Las llaves `YYYY-MM-DD` se
  parsean componente por componente para que los cortes de ciclo coincidan con el reloj
  de pared.
- **Sin `NaN` ni divisiones entre cero.** Toda entrada pasa por `safeNumber`/`clamp`, y
  el último día usa 1 como divisor mínimo. Cubierto por pruebas.
- **Paleta de gráficas validada** contra superficie oscura: banda de luminosidad, piso de
  croma, separación para daltonismo en todos los pares y contraste ≥ 3:1.

## Datos

Todo vive en IndexedDB, en el dispositivo. No hay servidor, cuenta ni sincronización:
la app funciona completa sin red y "Borrar todos mis datos" en Ajustes es definitivo.

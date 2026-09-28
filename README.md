# DiDi Analytics & Tracker

> Basada en **WeeklyBurn**. URL pública (una vez activado GitHub Pages):
> **https://gerardo20-2.github.io/App-finanza/**

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
npm run build      # build de producción (servidor Next)
npm run build:static  # sitio estático en out/ (lo que se publica en GitHub Pages)
npm test           # pruebas del motor financiero y de la analítica operativa
npm run typecheck  # tsc --noEmit
```

## Despliegue en GitHub Pages

Cada push a `main` ejecuta `.github/workflows/deploy.yml`: instala, corre typecheck y
pruebas, genera el export estático (`out/`) y lo publica. Si una prueba falla, no se
publica nada.

### Activar GitHub Pages (una sola vez)

1. En GitHub abre el repositorio → **Settings** → **Pages** (menú izquierdo, sección
   *Code and automation*).
2. En **Build and deployment → Source** elige **GitHub Actions** (no "Deploy from a
   branch").
3. Asegúrate de que exista la rama `main` con este código (ver abajo) y haz push, o ve a
   **Actions → Deploy to GitHub Pages → Run workflow** para lanzarlo a mano.
4. Cuando el job `deploy` termine en verde, la URL aparece en **Settings → Pages** y en el
   resumen del workflow: `https://<usuario>.github.io/<repo>/`.

Si el repositorio es privado, GitHub Pages requiere un plan de pago (Pro, Team o
Enterprise). En la cuenta gratuita, el repositorio debe ser público.

### Llevar esta rama a `main`

```bash
# Opción A: Pull Request (recomendado) — sube la rama y ábrelo en GitHub
git push -u origin feature/pwa-production-deploy

# Opción B: crear/actualizar main directamente
git checkout -B main feature/pwa-production-deploy
git push -u origin main
```

### Instalar en el celular

- **Android (Chrome):** abre la URL → menú ⋮ → **Instalar app**.
- **iPhone (Safari):** abre la URL → botón Compartir → **Agregar a inicio**.

La app abre sin conexión: el service worker guarda el shell (HTML, JS, CSS, iconos) y
los datos viven en IndexedDB en el propio teléfono.

### Cómo funciona el subpath

GitHub Pages sirve el proyecto bajo `/<repo>/`. El workflow toma ese prefijo de
`actions/configure-pages` y lo pasa como `NEXT_PUBLIC_BASE_PATH`; `next.config.mjs`
lo aplica a rutas y assets, `src/lib/basePath.ts` al manifest, iconos y registro del
SW, y `public/sw.js` resuelve todo contra su propio `scope`. Para probar el export en
local con el mismo prefijo:

```bash
NEXT_PUBLIC_BASE_PATH=/App-finanza npm run build:static
mkdir -p /tmp/pages && ln -sfn "$PWD/out" /tmp/pages/App-finanza
python3 -m http.server 4173 -d /tmp/pages   # http://localhost:4173/App-finanza/
```

> Los datos se guardan por origen: lo que registres en `localhost` no aparece en la
> URL de GitHub Pages, y viceversa.

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

## Analítica operativa DiDi

Cada tarjeta diaria del Historial tiene un "Detalle de odómetro / km" que cruza el
tablero de DiDi (distancia, tiempo conectado y activo, viajes, ingreso) con el odómetro
y la gasolina del día (los gastos `combustible`). Nada de esto toca el cupo ni el saldo.

```
η_km = Km_DiDi ÷ (Km_fin − Km_inicio)        η_t  = T_activo ÷ T_conectado
G_DiDi = Gasolina · η_km                      MN   = Ingreso − G_DiDi
R_km = MN ÷ Km_DiDi      R_hr = MN ÷ Horas    EPV  = Ingreso ÷ Viajes
IRD  = 100 · (0.40·R̂_km + 0.35·R̂_hr + 0.15·η_t + 0.10·η_km)
```

`R̂` se normaliza contra el mejor día del mes (`valor ÷ máximo`, saturado a 0..1): el
mejor día vale 1, un día con margen negativo vale 0 y un solo día registrado no divide
entre cero. El "Tablero de Inteligencia Operativa" muestra el Día Estrella
(`argmax IRD`), la eficiencia del mes ponderada por volumen, el perfil lunes–domingo y
el WoW contra **los mismos días** de la semana anterior (cortando en ayer si hoy aún no
se captura).

## Arquitectura

```
public/               # Se copia tal cual a la raíz del sitio publicado
├── manifest.json     # PWA: nombre, colores, iconos
├── sw.js             # Service worker (caché del shell, modo offline)
└── icons/            # icon.svg, icon-192/512.png, apple-icon.png
.github/workflows/
└── deploy.yml        # Build estático + publicación en GitHub Pages
src/
├── app/            # Rutas: dashboard, historial, analítica, ajustes
├── components/
│   ├── dashboard/  # DailyBurnGauge, QuickExpenseBar, GasReserveCard, SprintDayDots
│   ├── history/    # MileageAuditPanel, OperationalDashboard (analítica DiDi)
│   ├── modals/     # FullExpenseModal (teclado táctil), CycleResetModal
│   ├── shared/     # BottomNav, StatusBadge, ServiceWorkerProvider
│   └── ui/         # Primitivas shadcn/ui sobre Radix
├── hooks/
│   ├── useWeeklyBudget.ts  # Estado reactivo sobre Dexie (useLiveQuery)
│   ├── useOperationalAnalytics.ts  # Bitácoras de km + gasolina del mes
│   └── useHapticSound.ts   # Tonos sintetizados + vibración
└── lib/
    ├── db.ts             # Esquema y acceso a IndexedDB
    ├── budgetEngine.ts   # Lógica pura y determinista
    ├── operationalAnalytics.ts  # Métricas DiDi, IRD y agregados (puro)
    ├── basePath.ts       # Prefijo de despliegue (GitHub Pages)
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

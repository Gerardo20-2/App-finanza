import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildBurnSeries,
  calculateBudget,
  calculateDailyAllowance,
  chargeableAmounts,
  distributeSurplus,
  getCategoryTotals,
  getDailyUsage,
  getWeekProgress,
  resolveStatus,
  type EngineCycle,
  type EngineTransaction,
} from './budgetEngine';

/* -------------------------------------------------------------------------- */
/*                                  Fixtures                                  */
/* -------------------------------------------------------------------------- */

/** Ciclo canónico: lunes 2026-09-07 a domingo 2026-09-13. */
const CYCLE: EngineCycle = {
  startDate: '2026-09-07',
  endDate: '2026-09-13',
  totalIncome: 1400,
  gasReserve: 400,
  fixedExpenses: 0,
};

/** Presupuesto operativo esperado: 1400 - 400 - 0 = 1000. */
const OPERATING = 1000;

/** Local noon: evita cualquier ambigüedad de zona horaria en los asserts. */
function day(n: number): Date {
  return new Date(2026, 8, 6 + n, 12, 0, 0, 0);
}

function tx(
  dayNumber: number,
  amount: number,
  category: EngineTransaction['category'] = 'comida',
): EngineTransaction {
  return { amount, category, date: day(dayNumber).toISOString() };
}

/** Recorre recursivamente un objeto y falla si encuentra NaN o Infinity. */
function assertAllFinite(value: unknown, path = 'root'): void {
  if (typeof value === 'number') {
    assert.ok(
      Number.isFinite(value),
      `${path} no es finito: ${String(value)}`,
    );
    return;
  }
  if (value === null || value === undefined) return;
  if (value instanceof Date) {
    assert.ok(Number.isFinite(value.getTime()), `${path} es una fecha inválida`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertAllFinite(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assertAllFinite(child, `${path}.${key}`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                          calculateDailyAllowance                           */
/* -------------------------------------------------------------------------- */

describe('calculateDailyAllowance', () => {
  it('reparte el saldo entre los días restantes', () => {
    assert.equal(calculateDailyAllowance(1000, 5), 200);
    assert.equal(calculateDailyAllowance(700, 7), 100);
  });

  it('el último día entrega el saldo completo, sin dividir entre cero', () => {
    assert.equal(calculateDailyAllowance(180, 1), 180);
  });

  it('nunca divide entre cero cuando el ciclo ya venció', () => {
    for (const days of [0, -1, -99]) {
      const result = calculateDailyAllowance(500, days);
      assert.ok(Number.isFinite(result), `días=${days} produjo ${result}`);
      assert.equal(result, 500);
    }
  });

  it('degrada entradas no finitas a 0 en vez de propagar NaN', () => {
    const garbage = [NaN, Infinity, -Infinity];
    for (const bad of garbage) {
      assert.equal(calculateDailyAllowance(bad, 5), 0);
      assert.ok(Number.isFinite(calculateDailyAllowance(500, bad)));
    }
    assert.equal(calculateDailyAllowance(NaN, NaN), 0);
  });

  it('un saldo agotado o negativo devuelve cupo 0, nunca negativo', () => {
    assert.equal(calculateDailyAllowance(0, 3), 0);
    assert.equal(calculateDailyAllowance(-250, 3), 0);
  });

  it('redondea a centavos sin arrastrar error de punto flotante', () => {
    assert.equal(calculateDailyAllowance(1000, 3), 333.33);
    assert.equal(calculateDailyAllowance(0.1 + 0.2, 1), 0.3);
  });
});

/* -------------------------------------------------------------------------- */
/*                             distributeSurplus                              */
/* -------------------------------------------------------------------------- */

describe('distributeSurplus', () => {
  it('reparte el subgasto entre los días futuros (recompensa)', () => {
    // Caso del brief: cupo 180, gastó 100 -> sobran 80.
    const result = distributeSurplus(180, 100, 4);
    assert.equal(result.surplus, 80);
    assert.equal(result.daysToSpread, 4);
    assert.equal(result.perDayDelta, 20);
    assert.equal(result.projectedNextAllowance, 200);
  });

  it('reparte el sobregasto entre los días futuros (castigo)', () => {
    // Caso del brief: cupo 180, gastó 250 -> faltan 70.
    const result = distributeSurplus(180, 250, 7);
    assert.equal(result.surplus, -70);
    assert.equal(result.perDayDelta, -10);
    assert.equal(result.projectedNextAllowance, 170);
  });

  it('el último día no reparte nada y no genera NaN', () => {
    const result = distributeSurplus(180, 100, 0);
    assert.equal(result.daysToSpread, 0);
    assert.equal(result.perDayDelta, 0);
    assert.equal(result.projectedNextAllowance, 0);
    assert.equal(result.surplus, 80);
    assertAllFinite(result, 'ultimoDia');
  });

  it('días negativos se tratan como último día', () => {
    const result = distributeSurplus(180, 100, -3);
    assert.equal(result.daysToSpread, 0);
    assert.equal(result.perDayDelta, 0);
    assertAllFinite(result, 'diasNegativos');
  });

  it('sobrevive a entradas no finitas', () => {
    assertAllFinite(distributeSurplus(NaN, NaN, NaN), 'basura');
    assertAllFinite(distributeSurplus(Infinity, 100, 3), 'infinito');
  });

  it('la proyección nunca baja de cero', () => {
    const result = distributeSurplus(100, 900, 2);
    assert.equal(result.projectedNextAllowance, 0);
  });
});

/* -------------------------------------------------------------------------- */
/*                              getWeekProgress                               */
/* -------------------------------------------------------------------------- */

describe('getWeekProgress', () => {
  it('ubica correctamente el primer día', () => {
    const progress = getWeekProgress(CYCLE, day(1));
    assert.equal(progress.totalDays, 7);
    assert.equal(progress.dayIndex, 1);
    assert.equal(progress.daysElapsed, 0);
    assert.equal(progress.daysRemaining, 7);
    assert.equal(progress.isLastDay, false);
    assert.equal(progress.isFinished, false);
  });

  it('ubica correctamente el último día', () => {
    const progress = getWeekProgress(CYCLE, day(7));
    assert.equal(progress.dayIndex, 7);
    assert.equal(progress.daysRemaining, 1);
    assert.equal(progress.isLastDay, true);
    assert.equal(progress.percentComplete, 1);
  });

  it('marca el ciclo vencido sin días restantes negativos', () => {
    const progress = getWeekProgress(CYCLE, day(12));
    assert.equal(progress.isFinished, true);
    assert.equal(progress.daysRemaining, 0);
    assert.equal(progress.dayIndex, 7);
    assert.ok(progress.daysRemaining >= 0);
  });

  it('satura un ciclo que aún no empieza', () => {
    const progress = getWeekProgress(CYCLE, day(-5));
    assert.equal(progress.isPending, true);
    assert.equal(progress.dayIndex, 1);
    assert.equal(progress.daysRemaining, 7);
  });

  it('tolera fechas corruptas sin romperse', () => {
    const progress = getWeekProgress({ startDate: 'basura', endDate: '' }, day(1));
    assert.ok(Number.isFinite(progress.totalDays));
    assert.ok(progress.totalDays > 0);
    assert.ok(Number.isFinite(progress.daysRemaining));
  });
});

/* -------------------------------------------------------------------------- */
/*                      Reserva de gasolina y atribución                      */
/* -------------------------------------------------------------------------- */

describe('chargeableAmounts', () => {
  it('la gasolina dentro de la reserva no consume cupo', () => {
    const result = chargeableAmounts([tx(1, 150, 'combustible')], 400);
    assert.deepEqual(result.charges, [0]);
    assert.equal(result.gasSpent, 150);
    assert.equal(result.gasOverflow, 0);
  });

  it('sólo el excedente sobre la reserva consume cupo', () => {
    const result = chargeableAmounts(
      [tx(1, 300, 'combustible'), tx(2, 250, 'combustible')],
      400,
    );
    // La primera carga cabe entera; de la segunda sólo 150 rebasan la reserva.
    assert.deepEqual(result.charges, [0, 150]);
    assert.equal(result.gasSpent, 550);
    assert.equal(result.gasOverflow, 150);
  });

  it('el resto de categorías consume el importe íntegro', () => {
    const result = chargeableAmounts(
      [tx(1, 35, 'comida'), tx(1, 100, 'super'), tx(1, 60, 'gustos')],
      400,
    );
    assert.deepEqual(result.charges, [35, 100, 60]);
  });

  it('ignora importes negativos o corruptos', () => {
    const result = chargeableAmounts(
      [tx(1, -50, 'comida'), tx(1, NaN, 'comida')],
      400,
    );
    assert.deepEqual(result.charges, [0, 0]);
    assertAllFinite(result, 'cargosCorruptos');
  });

  it('sin reserva, toda la gasolina consume cupo', () => {
    const result = chargeableAmounts([tx(1, 150, 'combustible')], 0);
    assert.deepEqual(result.charges, [150]);
    assert.equal(result.gasOverflow, 150);
  });
});

/* -------------------------------------------------------------------------- */
/*                              calculateBudget                               */
/* -------------------------------------------------------------------------- */

describe('calculateBudget', () => {
  it('reparte el presupuesto operativo plano cuando no hay gasto', () => {
    const snap = calculateBudget({ cycle: CYCLE, transactions: [], referenceDate: day(1) });
    assert.equal(snap.operatingBudget, OPERATING);
    assert.equal(snap.remainingBalance, OPERATING);
    assert.equal(snap.dailyAllowance, 142.86); // 1000 / 7
    assert.equal(snap.spentToday, 0);
    assert.equal(snap.availableToday, 142.86);
    assert.equal(snap.status, 'healthy');
    assert.equal(snap.isSurvivalMode, false);
  });

  it('gastar hoy NO encoge el cupo de hoy, sólo la barra disponible', () => {
    const snap = calculateBudget({
      cycle: CYCLE,
      transactions: [tx(1, 100)],
      referenceDate: day(1),
    });
    assert.equal(snap.dailyAllowance, 142.86);
    assert.equal(snap.spentToday, 100);
    assert.equal(snap.availableToday, 42.86);
    assert.equal(snap.overspentToday, 0);
  });

  it('el subgasto de ayer sube el cupo de hoy (recompensa)', () => {
    const snap = calculateBudget({
      cycle: CYCLE,
      transactions: [tx(1, 100)],
      referenceDate: day(2),
    });
    // Saldo 900 entre 6 días restantes.
    assert.equal(snap.dailyAllowance, 150);
    assert.ok(snap.dailyAllowance > 142.86);
  });

  it('el sobregasto de ayer baja el cupo de hoy (castigo)', () => {
    const snap = calculateBudget({
      cycle: CYCLE,
      transactions: [tx(1, 250)],
      referenceDate: day(2),
    });
    // Saldo 750 entre 6 días restantes.
    assert.equal(snap.dailyAllowance, 125);
    assert.ok(snap.dailyAllowance < 142.86);
  });

  it('la gasolina dentro de la reserva deja intacto el cupo de comida', () => {
    const sinGas = calculateBudget({ cycle: CYCLE, transactions: [], referenceDate: day(2) });
    const conGas = calculateBudget({
      cycle: CYCLE,
      transactions: [tx(1, 150, 'combustible')],
      referenceDate: day(2),
    });
    assert.equal(conGas.dailyAllowance, sinGas.dailyAllowance);
    assert.equal(conGas.remainingBalance, sinGas.remainingBalance);
    assert.equal(conGas.gas.remaining, 250);
    assert.equal(conGas.gas.spent, 150);
    assert.equal(conGas.gas.overflow, 0);
  });

  it('la gasolina por encima de la reserva sí golpea el cupo', () => {
    const snap = calculateBudget({
      cycle: CYCLE,
      transactions: [tx(1, 500, 'combustible')],
      referenceDate: day(2),
    });
    assert.equal(snap.gas.remaining, 0);
    assert.equal(snap.gas.overflow, 100);
    assert.equal(snap.remainingBalance, 900);
    assert.equal(snap.dailyAllowance, 150); // 900 / 6
  });

  it('entra en Modo Supervivencia cuando el saldo se agota antes de tiempo', () => {
    const snap = calculateBudget({
      cycle: CYCLE,
      transactions: [tx(1, 600), tx(2, 500)],
      referenceDate: day(3),
    });
    assert.ok(snap.remainingBalance <= 0);
    assert.equal(snap.isSurvivalMode, true);
    assert.equal(snap.status, 'survival');
    assert.equal(snap.dailyAllowance, 0);
    assert.equal(snap.availableToday, 0);
    assertAllFinite(snap, 'supervivencia');
  });

  it('el último día entrega el saldo íntegro sin dividir entre cero', () => {
    const snap = calculateBudget({
      cycle: CYCLE,
      transactions: [tx(1, 100)],
      referenceDate: day(7),
    });
    assert.equal(snap.progress.daysRemaining, 1);
    assert.equal(snap.dailyAllowance, 900);
    assert.equal(snap.surplus.daysToSpread, 0);
    assert.equal(snap.surplus.perDayDelta, 0);
    assertAllFinite(snap, 'ultimoDia');
  });

  it('un ciclo vencido no reparte cupo y no explota', () => {
    const snap = calculateBudget({
      cycle: CYCLE,
      transactions: [tx(1, 100)],
      referenceDate: day(20),
    });
    assert.equal(snap.progress.isFinished, true);
    assert.equal(snap.dailyAllowance, 0);
    assert.equal(snap.isSurvivalMode, false);
    assertAllFinite(snap, 'cicloVencido');
  });

  it('el semáforo respeta los umbrales 50% / 20%', () => {
    const verde = calculateBudget({ cycle: CYCLE, transactions: [tx(1, 50)], referenceDate: day(1) });
    const ambar = calculateBudget({ cycle: CYCLE, transactions: [tx(1, 100)], referenceDate: day(1) });
    const rojo = calculateBudget({ cycle: CYCLE, transactions: [tx(1, 130)], referenceDate: day(1) });
    assert.equal(verde.status, 'healthy');
    assert.equal(ambar.status, 'caution');
    assert.equal(rojo.status, 'critical');
  });

  it('los gastos fijos salen antes de repartir el cupo', () => {
    const snap = calculateBudget({
      cycle: { ...CYCLE, fixedExpenses: 300 },
      transactions: [],
      referenceDate: day(1),
    });
    assert.equal(snap.operatingBudget, 700);
    assert.equal(snap.dailyAllowance, 100);
  });

  it('nunca produce NaN en ningún día del ciclo, con cualquier gasto', () => {
    const escenarios: EngineTransaction[][] = [
      [],
      [tx(1, 35), tx(2, 65), tx(3, 100)],
      [tx(1, 900), tx(2, 900)], // ruina total
      [tx(1, 150, 'combustible'), tx(4, 400, 'combustible')], // reserva rebasada
      [tx(1, 0), tx(2, -100), tx(3, NaN)], // datos corruptos
      [tx(9, 200)], // gasto fuera del ciclo
    ];

    for (const [index, transactions] of escenarios.entries()) {
      for (let d = -2; d <= 10; d += 1) {
        const snap = calculateBudget({ cycle: CYCLE, transactions, referenceDate: day(d) });
        assertAllFinite(snap, `escenario#${index}/día${d}`);
        assert.ok(snap.dailyAllowance >= 0, `cupo negativo en escenario#${index}/día${d}`);
        assert.ok(snap.availableToday >= 0);
        assert.ok(snap.gas.remaining >= 0);
        assert.ok(snap.usedRatio >= 0 && snap.usedRatio <= 1);
        assert.ok(snap.availableRatio >= 0 && snap.availableRatio <= 1);
      }
    }
  });

  it('sobrevive a un ciclo completamente vacío (ingreso cero)', () => {
    const snap = calculateBudget({
      cycle: { startDate: '2026-09-07', endDate: '2026-09-13', totalIncome: 0, gasReserve: 0 },
      transactions: [],
      referenceDate: day(1),
    });
    assert.equal(snap.operatingBudget, 0);
    assert.equal(snap.dailyAllowance, 0);
    assert.equal(snap.gas.usedRatio, 0);
    assertAllFinite(snap, 'ingresoCero');
  });

  it('satura la reserva de gasolina al ingreso disponible', () => {
    const snap = calculateBudget({
      cycle: { ...CYCLE, gasReserve: 99999 },
      transactions: [],
      referenceDate: day(1),
    });
    assert.equal(snap.gas.reserve, CYCLE.totalIncome);
    assert.equal(snap.operatingBudget, 0);
    assertAllFinite(snap, 'reservaDesbordada');
  });

  it('la suma de cupos diarios simulados no rebasa el presupuesto operativo', () => {
    // Simula la semana gastando exactamente el cupo cada día: debe cerrar en 0.
    const transactions: EngineTransaction[] = [];
    let repartido = 0;

    for (let d = 1; d <= 7; d += 1) {
      const snap = calculateBudget({ cycle: CYCLE, transactions, referenceDate: day(d) });
      repartido += snap.dailyAllowance;
      transactions.push(tx(d, snap.dailyAllowance));
    }

    const cierre = calculateBudget({ cycle: CYCLE, transactions, referenceDate: day(7) });
    assert.ok(Math.abs(repartido - OPERATING) < 0.05, `repartido=${repartido}`);
    assert.ok(Math.abs(cierre.remainingBalance) < 0.05, `saldo final=${cierre.remainingBalance}`);
  });
});

/* -------------------------------------------------------------------------- */
/*                            Series de analítica                             */
/* -------------------------------------------------------------------------- */

describe('series y agregados', () => {
  it('getDailyUsage cubre los 7 días y marca hoy', () => {
    const usage = getDailyUsage({
      cycle: CYCLE,
      transactions: [tx(1, 100), tx(1, 50), tx(3, 80)],
      referenceDate: day(3),
    });
    assert.equal(usage.length, 7);
    assert.equal(usage[0]?.spent, 150);
    assert.equal(usage[1]?.spent, 0);
    assert.equal(usage[2]?.spent, 80);
    assert.equal(usage[2]?.isToday, true);
    assert.equal(usage[6]?.isFuture, true);
    assertAllFinite(usage, 'uso');
  });

  it('buildBurnSeries corta el acumulado real en el día de hoy', () => {
    const serie = buildBurnSeries({
      cycle: CYCLE,
      transactions: [tx(1, 100), tx(2, 200)],
      referenceDate: day(2),
    });
    assert.equal(serie.length, 7);
    assert.equal(serie[0]?.actual, 100);
    assert.equal(serie[1]?.actual, 300);
    assert.equal(serie[2]?.actual, null);
    assert.equal(serie[6]?.ideal, OPERATING);
    assertAllFinite(serie.map((p) => ({ ideal: p.ideal, day: p.day })), 'serie');
  });

  it('getCategoryTotals ordena de mayor a menor', () => {
    const totals = getCategoryTotals([
      tx(1, 35, 'comida'),
      tx(1, 65, 'comida'),
      tx(2, 400, 'combustible'),
      tx(3, 20, 'gustos'),
    ]);
    assert.equal(totals[0]?.category, 'combustible');
    assert.equal(totals[0]?.total, 400);
    assert.equal(totals[1]?.category, 'comida');
    assert.equal(totals[1]?.total, 100);
    assert.equal(totals[1]?.count, 2);
  });
});

describe('resolveStatus', () => {
  it('mapea las proporciones al semáforo', () => {
    assert.equal(resolveStatus(1, false), 'healthy');
    assert.equal(resolveStatus(0.51, false), 'healthy');
    assert.equal(resolveStatus(0.5, false), 'caution');
    assert.equal(resolveStatus(0.21, false), 'caution');
    assert.equal(resolveStatus(0.2, false), 'critical');
    assert.equal(resolveStatus(0.01, false), 'critical');
    assert.equal(resolveStatus(0, false), 'survival');
    assert.equal(resolveStatus(0.9, true), 'survival');
  });

  it('tolera proporciones basura', () => {
    assert.equal(resolveStatus(NaN, false), 'survival');
    assert.equal(resolveStatus(Infinity, false), 'healthy');
  });
});

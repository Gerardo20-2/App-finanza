import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calcDailyMetrics,
  calcIRD,
  calcWeeklyAndMonthlyAggregates,
  parseDurationMinutes,
  parseNonNegative,
  parseTripCount,
  percentChange,
  type DailyMetrics,
  type DayData,
} from './operationalAnalytics';

/* -------------------------------------------------------------------------- */
/*                                  Fixtures                                  */
/* -------------------------------------------------------------------------- */

/**
 * Jornada canónica: 120 km de odómetro, 90 km DiDi, $400 de gasolina,
 * 8 h conectado con 6 h activas, 12 viajes y $1,200 de ingreso.
 */
const DAY: DayData = {
  dateKey: '2026-09-07',
  ingreso: 1_200,
  gasolina: 400,
  kmInicio: 45_000,
  kmFin: 45_120,
  kmDidi: 90,
  minConectado: 480,
  minActivo: 360,
  numViajes: 12,
};

function day(dateKey: string, patch: Partial<DayData> = {}): DailyMetrics {
  return calcDailyMetrics({ ...DAY, dateKey, ...patch });
}

/** Recorre recursivamente un objeto y falla si encuentra NaN o Infinity. */
function assertAllFinite(value: unknown, path = 'root'): void {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} no es finito: ${String(value)}`);
    return;
  }
  if (value === null || value === undefined || typeof value !== 'object') return;
  if (value instanceof Map) {
    for (const [key, item] of value) assertAllFinite(item, `${path}.${String(key)}`);
    return;
  }
  for (const [key, item] of Object.entries(value)) assertAllFinite(item, `${path}.${key}`);
}

/* -------------------------------------------------------------------------- */
/*                                   Parseo                                   */
/* -------------------------------------------------------------------------- */

describe('parseDurationMinutes', () => {
  it('acepta reloj HH:MM', () => {
    assert.equal(parseDurationMinutes('8:30'), 510);
    assert.equal(parseDurationMinutes('0:45'), 45);
  });

  it('acepta el formato del tablero de DiDi', () => {
    assert.equal(parseDurationMinutes('8 h 30 min'), 510);
    assert.equal(parseDurationMinutes('8h30m'), 510);
    assert.equal(parseDurationMinutes('8.5 h'), 510);
    assert.equal(parseDurationMinutes('45 min'), 45);
    assert.equal(parseDurationMinutes('2 horas'), 120);
  });

  it('número suelto: ≤ 24 son horas, > 24 son minutos', () => {
    assert.equal(parseDurationMinutes('8.5'), 510);
    assert.equal(parseDurationMinutes('8,5'), 510);
    assert.equal(parseDurationMinutes('510'), 510);
  });

  it('rechaza basura y vacíos', () => {
    assert.equal(parseDurationMinutes('8:75'), null);
    assert.equal(parseDurationMinutes('ocho'), null);
    assert.equal(parseDurationMinutes('-2'), null);
    assert.equal(parseDurationMinutes('  '), null);
    assert.equal(parseDurationMinutes(undefined), null);
  });
});

describe('parseo de números', () => {
  it('campo vacío es null, no cero', () => {
    assert.equal(parseNonNegative(''), null);
    assert.equal(parseNonNegative('12,5'), 12.5);
  });

  it('los viajes deben ser enteros', () => {
    assert.equal(parseTripCount('12'), 12);
    assert.equal(parseTripCount('12.5'), null);
  });
});

/* -------------------------------------------------------------------------- */
/*                              Métricas diarias                              */
/* -------------------------------------------------------------------------- */

describe('calcDailyMetrics', () => {
  it('reparte km y calcula las eficiencias', () => {
    const m = calcDailyMetrics(DAY);
    assert.equal(m.kmTotal, 120);
    assert.equal(m.kmDidi, 90);
    assert.equal(m.kmMuertos, 30);
    assert.equal(m.etaKm, 0.75);
    assert.equal(m.etaTiempo, 0.75);
  });

  it('prorratea la gasolina y la suma cuadra con el total', () => {
    const m = calcDailyMetrics(DAY);
    assert.equal(m.gasDidi, 300);
    assert.equal(m.gasPersonal, 100);

    const odd = calcDailyMetrics({ ...DAY, kmFin: 45_117, kmDidi: 71, gasolina: 333.33 });
    assert.ok(Math.abs((odd.gasDidi ?? 0) + (odd.gasPersonal ?? 0) - 333.33) <= 0.01);
  });

  it('margen neto y rendimientos unitarios', () => {
    const m = calcDailyMetrics(DAY);
    assert.equal(m.margenNeto, 900); // 1200 − 300
    assert.equal(m.rKm, 10); // 900 / 90
    assert.equal(m.rHora, 112.5); // 900 / 8
    assert.equal(m.epv, 100); // 1200 / 12
    assert.equal(m.brutoKm, 13.33);
    assert.equal(m.brutoHora, 150);
    assert.equal(m.costoGasKm, 3.33);
  });

  it('sin gasolina el margen es el ingreso aunque falte el odómetro', () => {
    const m = calcDailyMetrics({ ...DAY, gasolina: 0, kmInicio: null, kmFin: null });
    assert.equal(m.gasDidi, 0);
    assert.equal(m.margenNeto, 1_200);
    assert.equal(m.rKm, 13.33);
  });

  it('con gasolina y sin odómetro no inventa margen', () => {
    const m = calcDailyMetrics({ ...DAY, kmInicio: null });
    assert.equal(m.gasDidi, null);
    assert.equal(m.margenNeto, null);
    assert.equal(m.rHora, null);
  });

  it('marca odómetro invertido', () => {
    const m = calcDailyMetrics({ ...DAY, kmFin: 44_990 });
    assert.equal(m.odometroInvalido, true);
    assert.equal(m.etaKm, null);
    assert.equal(m.costoGasKm, null);
  });

  it('marca km DiDi mayores al total y no los usa para tarifas', () => {
    const m = calcDailyMetrics({ ...DAY, kmDidi: 150 });
    assert.equal(m.didiExcedeTotal, true);
    assert.equal(m.gasDidi, null);
    assert.equal(m.brutoKm, null);
  });

  it('marca tiempo activo mayor al conectado', () => {
    const m = calcDailyMetrics({ ...DAY, minActivo: 600 });
    assert.equal(m.activoExcedeConectado, true);
    assert.equal(m.etaTiempo, null);
  });

  it('nunca divide entre cero', () => {
    const m = calcDailyMetrics({
      ...DAY,
      kmFin: DAY.kmInicio,
      kmDidi: 0,
      minConectado: 0,
      minActivo: 0,
      numViajes: 0,
    });
    assert.equal(m.kmTotal, 0);
    assert.equal(m.etaKm, null);
    assert.equal(m.etaTiempo, null);
    assert.equal(m.rKm, null);
    assert.equal(m.epv, null);
    assertAllFinite(m);
  });

  it('tolera un día completamente vacío', () => {
    const m = calcDailyMetrics({
      dateKey: '2026-09-07',
      ingreso: null,
      gasolina: Number.NaN,
      kmInicio: null,
      kmFin: null,
      kmDidi: null,
      minConectado: null,
      minActivo: null,
      numViajes: null,
    });
    assert.equal(m.kmTotal, null);
    assert.equal(m.margenNeto, null);
    assertAllFinite(m);
  });
});

/* -------------------------------------------------------------------------- */
/*                                     IRD                                    */
/* -------------------------------------------------------------------------- */

describe('calcIRD', () => {
  it('el mejor día en todo saca el máximo posible según sus eficiencias', () => {
    const only = day('2026-09-07');
    const ird = calcIRD(only, [only]);
    assert.ok(ird);
    // 1·0.40 + 1·0.35 + 0.75·0.15 + 0.75·0.10 = 0.9375
    assert.equal(ird.score, 94);
  });

  it('pondera 40/35/15/10', () => {
    const best = day('2026-09-07');
    // Mitad de ingreso, sin gasolina extra: R_km y R_hr caen a la mitad del mejor día.
    const half = day('2026-09-08', { ingreso: 750 }); // MN 450 → R_km 5, R_hr 56.25
    const ird = calcIRD(half, [best, half]);
    assert.ok(ird);
    assert.equal(ird.rKmNorm, 0.5);
    assert.equal(ird.rHoraNorm, 0.5);
    // 0.5·0.40 + 0.5·0.35 + 0.75·0.15 + 0.75·0.10 = 0.5625
    assert.equal(ird.score, 56);
  });

  it('un día con margen negativo aporta cero en rendimiento, no negativo', () => {
    const best = day('2026-09-07');
    const loss = day('2026-09-08', { ingreso: 100 }); // MN −200
    const ird = calcIRD(loss, [best, loss]);
    assert.ok(ird);
    assert.equal(ird.rKmNorm, 0);
    assert.equal(ird.rHoraNorm, 0);
    assert.ok(ird.score >= 0 && ird.score <= 100);
  });

  it('un día incompleto no se califica', () => {
    const incomplete = day('2026-09-07', { minActivo: null });
    assert.equal(calcIRD(incomplete, [incomplete]), null);
  });
});

/* -------------------------------------------------------------------------- */
/*                                  Agregados                                 */
/* -------------------------------------------------------------------------- */

describe('calcWeeklyAndMonthlyAggregates', () => {
  // Lunes 2026-09-07 … domingo 2026-09-13 (semana anterior) y
  // lunes 2026-09-14 … miércoles 2026-09-16 (semana en curso).
  const days: DailyMetrics[] = [
    day('2026-08-31'), // mes anterior: no entra a los agregados del mes
    day('2026-09-07'),
    day('2026-09-08', { ingreso: 750 }),
    day('2026-09-09', { ingreso: 900, kmDidi: 60 }), // más km muertos
    day('2026-09-10'),
    day('2026-09-14', { ingreso: 1_500 }),
    day('2026-09-15'),
    day('2026-09-16', { ingreso: 600 }),
  ];
  const referenceDate = new Date(2026, 8, 16, 12, 0, 0);
  const agg = calcWeeklyAndMonthlyAggregates({ days, referenceDate, weekStartDay: 1 });

  it('sólo toma días del mes', () => {
    assert.equal(agg.month, '2026-09');
    assert.equal(agg.days.length, 7);
    assert.equal(agg.irdByDay.has('2026-08-31'), false);
  });

  it('el Día Estrella es el argmax del IRD', () => {
    assert.ok(agg.starDay);
    assert.equal(agg.starDay.metrics.dateKey, '2026-09-14');
    const maxScore = Math.max(...[...agg.irdByDay.values()].map((ird) => ird.score));
    assert.equal(agg.starDay.ird.score, maxScore);
  });

  it('eficiencia de flota ponderada por volumen', () => {
    // 6 días a 90/120 y uno a 60/120 → 600 / 840
    assert.equal(agg.fleet.kmDidi, 600);
    assert.equal(agg.fleet.kmTotal, 840);
    assert.equal(agg.fleet.etaKm, 0.7143);
    assert.equal(agg.fleet.etaTiempo, 0.75);
  });

  it('perfil lunes a domingo', () => {
    assert.deepEqual(
      agg.weekdayProfile.map((row) => row.label),
      ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    );
    const monday = agg.weekdayProfile[0];
    assert.ok(monday);
    assert.equal(monday.days, 2);
    // Lunes 7: R_km 10 · lunes 14: MN 1200 → R_km 13.33 → promedio 11.67
    assert.equal(monday.avgRKm, 11.67);
    assert.equal(agg.weekdayProfile[4]?.avgRKm, null); // sin viernes registrados
  });

  it('responde qué día rinde más por hora y cuál tiene más km muertos', () => {
    assert.equal(agg.bestRHoraWeekday?.label, 'Lunes');
    assert.equal(agg.worstDeadKmWeekday?.label, 'Miércoles');
  });

  it('WoW compara los mismos días de la semana anterior', () => {
    const { current, previous } = agg.weekOverWeek;
    assert.equal(current.from, '2026-09-14');
    assert.equal(current.to, '2026-09-16');
    assert.equal(previous.from, '2026-09-07');
    assert.equal(previous.to, '2026-09-09'); // no incluye el jueves 10
    assert.equal(current.margenNeto, 1_200 + 900 + 300); // 2400
    // Anterior: 900 + 450 + (900 − 400·0.5 = 700) = 2050
    assert.equal(previous.margenNeto, 2_050);
    assert.equal(agg.weekOverWeek.margenNetoPct, percentChange(2_400, 2_050));
  });

  it('si hoy no tiene captura, WoW corta en ayer para ambas semanas', () => {
    const thursday = new Date(2026, 8, 17, 12, 0, 0); // jueves 17 sin captura
    const wow = calcWeeklyAndMonthlyAggregates({ days, referenceDate: thursday, weekStartDay: 1 })
      .weekOverWeek;
    assert.equal(wow.current.to, '2026-09-16');
    assert.equal(wow.previous.to, '2026-09-09'); // el jueves 10 no entra
    assert.equal(wow.current.days, wow.previous.days);
  });

  it('sin datos no truena ni produce NaN', () => {
    const empty = calcWeeklyAndMonthlyAggregates({ days: [], referenceDate, weekStartDay: 5 });
    assert.equal(empty.starDay, null);
    assert.equal(empty.fleet.etaKm, null);
    assert.equal(empty.weekOverWeek.margenNetoPct, null);
    assertAllFinite(empty);
  });
});

describe('percentChange', () => {
  it('usa el valor absoluto de la base', () => {
    assert.equal(percentChange(150, 100), 50);
    assert.equal(percentChange(-50, -100), 50);
    assert.equal(percentChange(10, 0), null);
  });
});

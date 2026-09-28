import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeMileageAudit, parseHours, parseNonNegative, type MileageInput } from './mileageAudit';

/** Jornada canónica: 120 km en total, 90 km de DiDi, $400 de gasolina. */
const DAY: MileageInput = {
  kmInicio: 45_000,
  kmFin: 45_120,
  kmDidi: 90,
  horasConectado: 8,
  gasolinaTotal: 400,
  ingresoDidi: 1_200,
};

describe('parseHours', () => {
  it('acepta decimal con punto o coma', () => {
    assert.equal(parseHours('8.5'), 8.5);
    assert.equal(parseHours('8,5'), 8.5);
  });

  it('acepta HH:MM', () => {
    assert.equal(parseHours('8:30'), 8.5);
    assert.equal(parseHours('0:45'), 0.75);
  });

  it('rechaza minutos fuera de rango y texto', () => {
    assert.equal(parseHours('8:75'), null);
    assert.equal(parseHours('ocho'), null);
    assert.equal(parseHours('-2'), null);
  });

  it('campo vacío es null, no cero', () => {
    assert.equal(parseHours('  '), null);
    assert.equal(parseNonNegative(''), null);
  });
});

describe('computeMileageAudit', () => {
  it('reparte kilómetros y porcentajes', () => {
    const audit = computeMileageAudit(DAY);
    assert.equal(audit.kmTotales, 120);
    assert.equal(audit.kmPersonales, 30);
    assert.equal(audit.pctDidi, 75);
    assert.equal(audit.pctPersonal, 25);
    assert.equal(audit.isComplete, true);
  });

  it('prorratea la gasolina y la suma cuadra con el total', () => {
    const audit = computeMileageAudit(DAY);
    assert.equal(audit.gasolinaDidi, 300);
    assert.equal(audit.gasolinaPersonal, 100);

    const odd = computeMileageAudit({ ...DAY, kmFin: 45_117, kmDidi: 71, gasolinaTotal: 333.33 });
    assert.ok(Math.abs((odd.gasolinaDidi ?? 0) + (odd.gasolinaPersonal ?? 0) - 333.33) <= 0.01);
  });

  it('calcula métricas de rendimiento', () => {
    const audit = computeMileageAudit(DAY);
    assert.equal(audit.gananciaPorKm, 13.33);
    assert.equal(audit.gananciaPorHora, 150);
    assert.equal(audit.costoGasolinaPorKm, 3.33);
  });

  it('marca odómetro invertido y no reparte', () => {
    const audit = computeMileageAudit({ ...DAY, kmFin: 44_990 });
    assert.equal(audit.odometroInvalido, true);
    assert.equal(audit.pctDidi, null);
    assert.equal(audit.costoGasolinaPorKm, null);
    assert.equal(audit.isComplete, false);
  });

  it('marca km DiDi mayores al total', () => {
    const audit = computeMileageAudit({ ...DAY, kmDidi: 150 });
    assert.equal(audit.didiExcedeTotal, true);
    assert.equal(audit.gasolinaDidi, null);
    assert.equal(audit.isComplete, false);
  });

  it('nunca divide entre cero', () => {
    const audit = computeMileageAudit({
      kmInicio: 100,
      kmFin: 100,
      kmDidi: 0,
      horasConectado: 0,
      gasolinaTotal: 200,
      ingresoDidi: 500,
    });
    assert.equal(audit.kmTotales, 0);
    assert.equal(audit.pctDidi, null);
    assert.equal(audit.gananciaPorKm, null);
    assert.equal(audit.gananciaPorHora, null);
    assert.equal(audit.costoGasolinaPorKm, null);
  });

  it('tolera campos vacíos', () => {
    const audit = computeMileageAudit({
      kmInicio: null,
      kmFin: null,
      kmDidi: null,
      horasConectado: null,
      gasolinaTotal: Number.NaN,
      ingresoDidi: null,
    });
    assert.equal(audit.kmTotales, null);
    assert.equal(audit.odometroInvalido, false);
    assert.equal(audit.didiExcedeTotal, false);
  });
});

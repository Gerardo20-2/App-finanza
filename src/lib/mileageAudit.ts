/**
 * WeeklyBurn — auditoría de kilometraje DiDi.
 *
 * Igual que `budgetEngine.ts`, todo aquí es puro: sin IndexedDB, sin React y
 * sin reloj. Recibe lo que el conductor capturó en la tarjeta del día y
 * devuelve el reparto de kilómetros, el prorrateo de la gasolina y las
 * métricas de rendimiento.
 *
 * Nada de esto alimenta al motor financiero: el ingreso DiDi del día y el
 * prorrateo son informativos y no cambian el cupo ni el saldo del ciclo.
 */

import { roundCurrency, safeNumber } from './utils';

export interface MileageInput {
  /** Odómetro al salir de casa. */
  kmInicio: number | null;
  /** Odómetro al regresar a casa. */
  kmFin: number | null;
  /** Kilómetros que reporta la app de DiDi. */
  kmDidi: number | null;
  /** Horas conectado, ya convertidas a decimal (ver `parseHours`). */
  horasConectado: number | null;
  /** Gasolina cargada ese día (suma de la categoría `combustible`). */
  gasolinaTotal: number;
  /** Lo que DiDi pagó ese día. */
  ingresoDidi: number | null;
}

export interface MileageAudit {
  /** `km_fin - km_inicio`. `null` si falta alguno de los dos. */
  kmTotales: number | null;
  /** Km DiDi validados (no superan el total). */
  kmDidi: number | null;
  /** `kmTotales - km_didi`. */
  kmPersonales: number | null;
  /** 0..100. `null` sin kilómetros totales positivos. */
  pctDidi: number | null;
  pctPersonal: number | null;
  gasolinaDidi: number | null;
  gasolinaPersonal: number | null;
  /** `$ / km` DiDi. */
  gananciaPorKm: number | null;
  /** `$ / hr` conectado. */
  gananciaPorHora: number | null;
  /** `$ / km` de gasolina sobre TODO lo recorrido. */
  costoGasolinaPorKm: number | null;
  /** `km_fin < km_inicio`: el odómetro no puede retroceder. */
  odometroInvalido: boolean;
  /** `km_didi > kmTotales`: DiDi no puede reportar más de lo que se manejó. */
  didiExcedeTotal: boolean;
  /** Hay datos suficientes para mostrar el desglose. */
  isComplete: boolean;
}

/** Redondeo a 2 decimales para kilómetros, porcentajes y tarifas. */
function round2(value: number): number {
  return roundCurrency(value);
}

/** Número finito y no negativo, o `null` si el campo está vacío o es basura. */
export function parseNonNegative(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Acepta horas en decimal (`8.5`, `8,5`) o reloj (`8:30`). Devuelve horas en
 * decimal, o `null` si el formato no es válido.
 */
export function parseHours(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const clock = /^(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    if (minutes >= 60) return null;
    return hours + minutes / 60;
  }

  return parseNonNegative(trimmed);
}

/** Divide sin producir `NaN` ni `Infinity`: sin divisor positivo -> `null`. */
function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return round2(numerator / denominator);
}

export function computeMileageAudit(input: MileageInput): MileageAudit {
  const gasolinaTotal = Math.max(0, safeNumber(input.gasolinaTotal));
  const { kmInicio, kmFin, kmDidi, horasConectado, ingresoDidi } = input;

  const kmTotales = kmInicio !== null && kmFin !== null ? round2(kmFin - kmInicio) : null;
  const odometroInvalido = kmTotales !== null && kmTotales < 0;
  const didiExcedeTotal =
    kmTotales !== null && !odometroInvalido && kmDidi !== null && kmDidi > kmTotales;

  const canSplit = kmTotales !== null && kmTotales > 0 && kmDidi !== null && !didiExcedeTotal;

  // Las proporciones se usan sin redondear para que el prorrateo de gasolina
  // no arrastre el error del porcentaje que se muestra en pantalla.
  const shareDidi = canSplit ? kmDidi / kmTotales : null;
  const sharePersonal = shareDidi !== null ? 1 - shareDidi : null;

  const kmPersonales = canSplit ? round2(kmTotales - kmDidi) : null;
  const pctDidi = shareDidi !== null ? round2(shareDidi * 100) : null;
  const pctPersonal = sharePersonal !== null ? round2(sharePersonal * 100) : null;

  const gasolinaDidi = shareDidi !== null ? roundCurrency(gasolinaTotal * shareDidi) : null;
  const gasolinaPersonal =
    sharePersonal !== null ? roundCurrency(gasolinaTotal * sharePersonal) : null;

  return {
    kmTotales,
    kmDidi: canSplit ? round2(kmDidi) : null,
    kmPersonales,
    pctDidi,
    pctPersonal,
    gasolinaDidi,
    gasolinaPersonal,
    gananciaPorKm: ratio(ingresoDidi, kmDidi),
    gananciaPorHora: ratio(ingresoDidi, horasConectado),
    costoGasolinaPorKm: odometroInvalido ? null : ratio(gasolinaTotal, kmTotales),
    odometroInvalido,
    didiExcedeTotal,
    isComplete: canSplit,
  };
}

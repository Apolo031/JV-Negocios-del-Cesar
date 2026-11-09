// Interpreta el nombre de archivo de una factura de servicios públicos
// (ej. "CONTRATO 194 EPM.pdf", "contrato 358 apartamento 1 energia.pdf") para
// adivinar el número de contrato, el tipo de servicio y, si aplica, la
// subunidad dentro del contrato (bodega/apartamento/oficina). Los nombres
// los escribe una persona a mano, así que traen errores de tipeo
// ("CONTRANTO", "ENERFGIA", "ACUEDUCTOI"...) — por eso todo se busca por
// coincidencia parcial sobre el texto sin tildes, no por nombre exacto.
//
// Esto es solo una PRIMERA ADIVINANZA para no digitar todo a mano: la
// pantalla siempre muestra una revisión editable antes de guardar nada.

import { stripAccents } from './importHelpers';

export const SERVICIOS = ['Energía', 'Acueducto', 'Gas', 'EPM', 'Agua y luz', 'Todas', 'Sin especificar'];

const SERVICIO_KEYWORDS = [
  [/ENERGI/, 'Energía'],
  [/ENER\w{0,2}GIA/, 'Energía'], // tolera errores de tipeo como "ENERFGIA"
  [/ACUEDUCT/, 'Acueducto'],
  [/ALCANOS|EFIGAS|EFIGAZ/, 'Gas'], // empresas de gas natural por región
  [/\bGAS\b/, 'Gas'],
  [/\bEPM\b/, 'EPM'],
  [/AGUA\s*Y\s*LUZ/, 'Agua y luz'],
  [/\bTODAS\b/, 'Todas'],
];

const SUBUNIDAD_RE = /\b(BODEGA|APARTAMENTO|OFICINA|LOCAL)\s*0*(\d+)\b/;

// Contrato número 1 a 3 cifras (los contratos reales de Base principal van
// de 1 a ~400) — un número más largo en el nombre del archivo suele ser un
// número de cuenta/factura de la empresa de servicios, no el contrato.
const NUMERO_CONTRATO_RE = /\b(\d{1,3})\b/;

/** Normaliza a mayúsculas sin tildes, para comparar sin depender de cómo lo haya escrito cada quien. */
function normalizar(s) {
  return stripAccents(String(s || '')).toUpperCase();
}

export function parseNombreFactura(nombreArchivo) {
  const sinExtension = String(nombreArchivo || '').replace(/\.[a-z0-9]+$/i, '');
  const norm = normalizar(sinExtension);

  let servicio = 'Sin especificar';
  for (const [re, nombre] of SERVICIO_KEYWORDS) {
    if (re.test(norm)) { servicio = nombre; break; }
  }

  const subMatch = norm.match(SUBUNIDAD_RE);
  const subunidad = subMatch ? `${subMatch[1].charAt(0) + subMatch[1].slice(1).toLowerCase()} ${subMatch[2]}` : null;

  // El número de contrato casi siempre viene justo después de la palabra
  // "CONTRATO" (con sus variantes de tipeo) — se busca ahí primero; si no
  // aparece esa palabra, se usa el primer número corto suelto del nombre.
  const trasContrato = norm.match(/CON\w*TO\s*(\d{1,3})\b/) || norm.match(/CO\w{2,5}TO\s*(\d{1,3})\b/);
  const numero = trasContrato ? trasContrato[1] : norm.match(NUMERO_CONTRATO_RE)?.[1];

  return {
    contrato: numero ? String(parseInt(numero, 10)) : null,
    servicio,
    subunidad,
  };
}

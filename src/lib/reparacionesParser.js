// Parser del archivo de "Control de reparaciones" — un registro por
// reparación recibida (cliente, artículo, servicio, responsable, estado,
// valor). A diferencia de Contratos/Facturas, el encabezado real no está en
// la primera fila: el archivo trae 2-3 filas de título arriba, así que la
// fila de encabezado se detecta buscando cuál fila tiene más columnas que
// coincidan con las esperadas, en vez de asumir que es la fila 0.

import * as XLSX from 'xlsx';
import { normalizeHeader, normalizedRow, mapRow, readWorkbook } from './importHelpers';

// [encabezado normalizado, nombre del campo, tipo]
const FIELD_MAP = [
  ['fecha', 'fecha', 'date'],
  ['¿es cliente?', 'esCliente', 'string'],
  ['nombre completo', 'nombre', 'string'],
  ['telefono', 'telefono', 'string'],
  ['direccion', 'direccion', 'string'],
  ['articulo / joya', 'articulo', 'string'],
  ['servicio', 'servicio', 'string'],
  ['responsable', 'responsable', 'string'],
  ['estado', 'estado', 'string'],
  ['valor', 'valor', 'string'],
  ['observaciones', 'observaciones', 'string'],
];

const FIELD_HEADERS = new Set(FIELD_MAP.map(([header]) => header));

/** Busca, en todas las hojas, la fila que mejor coincide con los encabezados esperados. */
function findHeaderRow(workbook) {
  let best = null;
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    for (let i = 0; i < Math.min(allRows.length, 15); i++) {
      const row = allRows[i] || [];
      const matches = row.filter((h) => h && FIELD_HEADERS.has(normalizeHeader(h))).length;
      if (matches === 0) continue;
      if (!best || matches > best.matches) best = { sheetName: name, rowIdx: i, matches };
    }
  }
  return best;
}

/** Parsea un ArrayBuffer/Uint8Array (.xlsx, .xls o .csv) a reparaciones planas. */
export function parseReparacionesBuffer(input) {
  const workbook = readWorkbook(input);
  const found = findHeaderRow(workbook);
  if (!found) return [];
  const ws = workbook.Sheets[found.sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { range: found.rowIdx, defval: null, raw: true });

  const reparaciones = [];
  for (const row of rows) {
    const reparacion = mapRow(normalizedRow(row), FIELD_MAP);
    // Fila vacía (sin nombre de cliente) — se descarta, no es un registro real.
    if (!reparacion.nombre) continue;
    reparaciones.push(reparacion);
  }
  return reparaciones;
}

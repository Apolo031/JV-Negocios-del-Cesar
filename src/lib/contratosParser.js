// Parser del archivo de "Contratos" (préstamos sobre oro) — un registro por
// contrato, con fechas de inicio/terminación, % de retroventa y estado. Se
// importa desde un Excel o CSV con las columnas de siempre.

import * as XLSX from 'xlsx';
import { normalizedRow, normalizeHeader, mapRow, readWorkbook, pickSheetByHeaders, slugifyId } from './importHelpers';

export { slugifyId };

// [encabezado normalizado, nombre del campo, tipo]
const FIELD_MAP = [
  ['sociedad', 'sociedad', 'string'],
  ['jefe de zona', 'jefeZona', 'string'],
  ['cod joyeria', 'codJoyeria', 'string'],
  ['codigo joyeria', 'codJoyeria', 'string'],
  ['pais', 'pais', 'string'],
  ['departamento', 'departamento', 'string'],
  ['ciudad', 'ciudad', 'string'],
  ['zona', 'zona', 'string'],
  ['fecha inicio', 'fechaInicio', 'date'],
  ['porcentaje retroventa', 'porcentajeRetroventa', 'percent'],
  ['contrato categoria', 'contratoCategoria', 'string'],
  ['contrato secuencia', 'contratoSecuencia', 'string'],
  ['joyeria', 'joyeria', 'string'],
  ['fecha terminacion', 'fechaTerminacion', 'date'],
  ['contrato gramos estimados', 'contratoGramosEstimados', 'number'],
  ['contrato gramos totales', 'contratoGramosTotales', 'number'],
  ['contrato valor', 'contratoValor', 'number'],
  ['contrato valor mes', 'contratoValorMes', 'number'],
  ['contrato termino', 'contratoTermino', 'number'],
  ['meses adeudados', 'mesesAdeudados', 'number'],
  ['documento cliente', 'documentoCliente', 'string'],
  ['cliente', 'cliente', 'string'],
  ['fecha retroventa', 'fechaRetroventa', 'date'],
  ['fecha resolucion', 'fechaResolucion', 'date'],
  ['creado por', 'creadoPor', 'string'],
  ['contrato estado', 'contratoEstado', 'string'],
  ['contrato motivo', 'contratoMotivo', 'string'],
  ['cliente telefono', 'clienteTelefono', 'string'],
  ['dias gracia', 'diasGracia', 'number'],
  ['cliente direccion', 'clienteDireccion', 'string'],
  ['fecha operacion', 'fechaOperacion', 'date'],
  ['meses pagados', 'mesesPagados', 'number'],
  ['valor retroventa', 'valorRetroventa', 'number'],
];

const FIELD_HEADERS = new Set(FIELD_MAP.map(([header]) => header));

/**
 * El "Porcentaje Retroventa" llega formateado distinto según el archivo: a
 * veces la celda es "%" de Excel (el valor crudo es una fracción, 0.095) y a
 * veces un número plano que ya es el porcentaje (9.5) — ambos se han visto
 * en archivos reales de este mismo reporte. Se detecta una sola vez por
 * archivo mirando el texto formateado (w) de la primera celda con dato de
 * esa columna, en vez de asumir un formato fijo.
 */
function isPercentFormatted(ws, colLetter) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cell = ws[colLetter + (r + 1)];
    if (cell && cell.v !== undefined && cell.v !== null) return typeof cell.w === 'string' && cell.w.includes('%');
  }
  return true;
}

/** Parsea un ArrayBuffer/Uint8Array (.xlsx, .xls o .csv) a contratos planos. */
export function parseContratosBuffer(input) {
  const workbook = readWorkbook(input);
  const ws = pickSheetByHeaders(workbook, FIELD_HEADERS);
  if (!ws) return [];

  const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, range: 0 })[0] || [];
  const pctColIdx = headerRow.findIndex((h) => normalizeHeader(h || '') === 'porcentaje retroventa');
  const pctIsFraction = pctColIdx === -1 ? true : isPercentFormatted(ws, XLSX.utils.encode_col(pctColIdx));

  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });

  const contratos = [];
  for (const row of rows) {
    const contrato = mapRow(normalizedRow(row), FIELD_MAP);
    // Fila vacía (sin secuencia de contrato) — se descarta, no es un registro real.
    if (!contrato.contratoSecuencia) continue;
    if (!pctIsFraction) contrato.porcentajeRetroventa /= 100;
    contratos.push(contrato);
  }
  return contratos;
}

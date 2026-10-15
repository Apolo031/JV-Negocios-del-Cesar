// Parser del archivo de "Contratos" (préstamos sobre oro) — un registro por
// contrato, con fechas de inicio/terminación, % de retroventa y estado. Se
// importa desde un Excel o CSV con las columnas de siempre.

import * as XLSX from 'xlsx';
import { normalizedRow, mapRow, readWorkbook, pickSheetByHeaders, slugifyId } from './importHelpers';

export { slugifyId };

// [encabezado normalizado, nombre del campo, tipo]
const FIELD_MAP = [
  ['cod joyeria', 'codJoyeria', 'string'],
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

/** Parsea un ArrayBuffer/Uint8Array (.xlsx, .xls o .csv) a contratos planos. */
export function parseContratosBuffer(input) {
  const workbook = readWorkbook(input);
  const ws = pickSheetByHeaders(workbook, FIELD_HEADERS);
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });

  const contratos = [];
  for (const row of rows) {
    const contrato = mapRow(normalizedRow(row), FIELD_MAP);
    // Fila vacía (sin secuencia de contrato) — se descarta, no es un registro real.
    if (!contrato.contratoSecuencia) continue;
    contratos.push(contrato);
  }
  return contratos;
}

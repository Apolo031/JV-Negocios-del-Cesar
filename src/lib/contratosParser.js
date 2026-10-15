// Parser del archivo de "Contratos" (préstamos sobre oro) — un registro por
// contrato, con fechas de inicio/terminación, % de retroventa y estado. Se
// importa desde un Excel o CSV con las columnas de siempre. Se ejecuta en el
// NAVEGADOR (la subida va directo a Firestore desde el cliente, no por una
// API route) para no toparse con el límite de tamaño de request de Vercel;
// por eso trabaja con ArrayBuffer/Uint8Array en vez de Buffer de Node.

import * as XLSX from 'xlsx';

function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function normalizeHeader(s) { return stripAccents(String(s)).toLowerCase().trim().replace(/\s+/g, ' '); }

// [encabezado normalizado, nombre del campo, tipo]
const FIELD_MAP = [
  ['cod joyeria', 'codJoyeria', 'string'],
  ['departamento', 'departamento', 'string'],
  ['ciudad', 'ciudad', 'string'],
  ['zona', 'zona', 'string'],
  ['fecha inicio', 'fechaInicio', 'date'],
  ['porcentaje retroventa', 'porcentajeRetroventa', 'number'],
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

function parseNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace('%', '').replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Devuelve "YYYY-MM-DD" (o "YYYY-MM-DD HH:mm:ss" si traía hora), o null si no hay fecha. */
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    return v.toISOString().slice(0, 19).replace('T', ' ').replace(/ 00:00:00$/, '');
  }
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})([ T](\d{2}:\d{2}(:\d{2})?))?/);
  if (m) return m[4] ? `${m[1]}-${m[2]}-${m[3]} ${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s || null;
}

export function slugifyId(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * true si los bytes son un .xlsx (ZIP, firma "PK") o .xls viejo (OLE2, firma
 * D0 CF 11 E0) — es decir, un binario real, no texto plano. Un CSV hay que
 * decodificarlo como string UTF-8 antes de pasarlo a XLSX.read; si se le
 * pasan los bytes crudos, SheetJS los interpreta como latin1 y corrompe los
 * acentos.
 */
function isBinaryWorkbook(bytes) {
  if (bytes.length < 4) return false;
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  const isOle2 = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  return isZip || isOle2;
}

/** Parsea un ArrayBuffer/Uint8Array (.xlsx, .xls o .csv) a contratos planos. */
export function parseContratosBuffer(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const workbook = isBinaryWorkbook(bytes)
    ? XLSX.read(bytes, { type: 'array', cellDates: true, raw: true })
    : XLSX.read(new TextDecoder('utf-8').decode(bytes), { type: 'string', cellDates: true, raw: true });
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });

  const contratos = [];
  for (const row of rows) {
    const byNormalizedHeader = {};
    for (const key of Object.keys(row)) byNormalizedHeader[normalizeHeader(key)] = row[key];

    const contrato = {};
    for (const [header, field, type] of FIELD_MAP) {
      const raw = byNormalizedHeader[header];
      if (type === 'number') contrato[field] = parseNumber(raw);
      else if (type === 'date') contrato[field] = parseDate(raw);
      else contrato[field] = raw === null || raw === undefined ? '' : String(raw).trim();
    }
    // Fila vacía (sin secuencia de contrato) — se descarta, no es un registro real.
    if (!contrato.contratoSecuencia) continue;
    contratos.push(contrato);
  }
  return contratos;
}

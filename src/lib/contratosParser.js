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

function parseNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace('%', '').replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/**
 * Una celda de Excel con formato "%" guarda el valor como fracción (9,5% se
 * guarda como 0.095) — hay que multiplicarlo por 100 para tener puntos
 * porcentuales. Un texto como "9,5%" ya viene en puntos (el "%" solo se
 * recorta), así que no se vuelve a multiplicar.
 */
function parsePercent(v) {
  if (typeof v === 'number') return v * 100;
  return parseNumber(v);
}

// Excel cuenta los días desde el 1900-01-00 (con un día bisiesto 1900 que en
// realidad no existió); el serial 25569 equivale al 1970-01-01, así que
// restando eso y pasando a milisegundos se llega directo al Date de JS sin
// pasar por SSF (que no siempre queda disponible al importar xlsx como
// namespace) ni por el huso horario local del entorno.
function excelSerialToDate(serial) {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return isNaN(d) ? null : d;
}

/** Devuelve "YYYY-MM-DD" (o "YYYY-MM-DD HH:mm:ss" si traía hora), o null si no hay fecha. */
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    return v.toISOString().slice(0, 19).replace('T', ' ').replace(/ 00:00:00$/, '');
  }
  if (typeof v === 'number') {
    const d = excelSerialToDate(v);
    if (d) return d.toISOString().slice(0, 10);
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

const FIELD_HEADERS = new Set(FIELD_MAP.map(([header]) => header));

/**
 * El archivo de contratos suele traer varias hojas (resúmenes, un respaldo
 * viejo, etc.) además de la que de verdad trae los contratos — por eso no se
 * puede asumir que es la primera. Se elige la hoja cuyo encabezado tenga más
 * columnas que coincidan con las que esperamos (y, si hay empate, la que
 * tenga más filas de datos).
 */
function pickContratosSheet(workbook) {
  let best = null;
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, range: 0 })[0] || [];
    const matches = headerRow.filter((h) => h && FIELD_HEADERS.has(normalizeHeader(h))).length;
    if (matches === 0) continue;
    const rowCount = (XLSX.utils.decode_range(ws['!ref'] || 'A1:A1').e.r) || 0;
    if (!best || matches > best.matches || (matches === best.matches && rowCount > best.rowCount)) {
      best = { name, matches, rowCount };
    }
  }
  return best ? workbook.Sheets[best.name] : workbook.Sheets[workbook.SheetNames[0]];
}

/** Parsea un ArrayBuffer/Uint8Array (.xlsx, .xls o .csv) a contratos planos. */
export function parseContratosBuffer(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  // Importante: NO pasar cellDates:true — SheetJS construiría el objeto Date
  // interpretando el serial en la hora LOCAL del entorno, y toISOString()
  // luego lo pasaría a UTC corriéndolo esas mismas horas (ej. a las 5 a.m. en
  // vez de medianoche, si el servidor corre en UTC-5). parseDate() ya
  // convierte el serial a UTC "a mano" con Date.UTC, sin ese problema.
  const workbook = isBinaryWorkbook(bytes)
    ? XLSX.read(bytes, { type: 'array', raw: true })
    : XLSX.read(new TextDecoder('utf-8').decode(bytes), { type: 'string', raw: true });
  const ws = pickContratosSheet(workbook);
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
      else if (type === 'percent') contrato[field] = parsePercent(raw);
      else if (type === 'date') contrato[field] = parseDate(raw);
      else contrato[field] = raw === null || raw === undefined ? '' : String(raw).trim();
    }
    // Fila vacía (sin secuencia de contrato) — se descarta, no es un registro real.
    if (!contrato.contratoSecuencia) continue;
    contratos.push(contrato);
  }
  return contratos;
}

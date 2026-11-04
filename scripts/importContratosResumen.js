// Uso:  node scripts/importContratosResumen.js "ruta/INFORME CONTRATOS (MES).xlsx"
//
// Version de servidor de la importacion liviana: parsea el informe y
// escribe SOLO el documento de indicadores en "contratos_resumen/actual"
// (nada de guardar una fila por contrato). Util para no depender de subir
// el archivo por el navegador, o para probar el nuevo flujo.

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const XLSX = require('xlsx');

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_KEY en .env.local');
  return JSON.parse(raw);
}

function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function normalizeHeader(s) { return stripAccents(String(s)).toLowerCase().trim().replace(/\s+/g, ' '); }

function parseNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace('%', '').replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function parsePercent(v) {
  if (typeof v === 'number') return v * 100;
  return parseNumber(v);
}
function excelSerialToDate(serial) {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return isNaN(d) ? null : d;
}
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 19).replace('T', ' ').replace(/ 00:00:00$/, '');
  if (typeof v === 'number') { const d = excelSerialToDate(v); if (d) return d.toISOString().slice(0, 10); }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})([ T](\d{2}:\d{2}(:\d{2})?))?/);
  if (m) return m[4] ? `${m[1]}-${m[2]}-${m[3]} ${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}${m[4] ? ' ' + m[4] : ''}`;
  return s || null;
}
function normalizedRow(row) {
  const out = {};
  for (const key of Object.keys(row)) out[normalizeHeader(key)] = row[key];
  return out;
}
function mapRow(byNormalizedHeader, fieldMap) {
  const out = {};
  for (const [header, field, type] of fieldMap) {
    const raw = byNormalizedHeader[header];
    if (raw === undefined) continue;
    if (type === 'number') out[field] = parseNumber(raw);
    else if (type === 'percent') out[field] = parsePercent(raw);
    else if (type === 'date') out[field] = parseDate(raw);
    else out[field] = raw === null ? '' : String(raw).trim();
  }
  return out;
}
function pickSheetByHeaders(workbook, expectedHeaders) {
  let best = null;
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: false });
    const headerRow = rows[0] || [];
    const matches = headerRow.filter((h) => h && expectedHeaders.has(normalizeHeader(h))).length;
    if (matches === 0) continue;
    const rowCount = rows.length - 1;
    if (!best || matches > best.matches || (matches === best.matches && rowCount > best.rowCount)) best = { name, matches, rowCount };
  }
  return best ? { name: best.name, ws: workbook.Sheets[best.name] } : { name: workbook.SheetNames[0], ws: workbook.Sheets[workbook.SheetNames[0]] };
}

const FIELD_MAP = [
  ['sociedad', 'sociedad', 'string'], ['jefe de zona', 'jefeZona', 'string'],
  ['cod joyeria', 'codJoyeria', 'string'], ['codigo joyeria', 'codJoyeria', 'string'],
  ['pais', 'pais', 'string'], ['departamento', 'departamento', 'string'], ['ciudad', 'ciudad', 'string'], ['zona', 'zona', 'string'],
  ['fecha inicio', 'fechaInicio', 'date'], ['porcentaje retroventa', 'porcentajeRetroventa', 'percent'],
  ['contrato categoria', 'contratoCategoria', 'string'], ['contrato secuencia', 'contratoSecuencia', 'string'],
  ['joyeria', 'joyeria', 'string'], ['fecha terminacion', 'fechaTerminacion', 'date'],
  ['contrato gramos estimados', 'contratoGramosEstimados', 'number'], ['contrato gramos totales', 'contratoGramosTotales', 'number'],
  ['contrato valor', 'contratoValor', 'number'], ['contrato valor mes', 'contratoValorMes', 'number'],
  ['contrato termino', 'contratoTermino', 'number'], ['meses adeudados', 'mesesAdeudados', 'number'],
  ['documento cliente', 'documentoCliente', 'string'], ['cliente', 'cliente', 'string'],
  ['fecha retroventa', 'fechaRetroventa', 'date'], ['fecha resolucion', 'fechaResolucion', 'date'],
  ['creado por', 'creadoPor', 'string'], ['contrato estado', 'contratoEstado', 'string'], ['contrato motivo', 'contratoMotivo', 'string'],
  ['cliente telefono', 'clienteTelefono', 'string'], ['dias gracia', 'diasGracia', 'number'], ['cliente direccion', 'clienteDireccion', 'string'],
  ['fecha operacion', 'fechaOperacion', 'date'], ['meses pagados', 'mesesPagados', 'number'], ['valor retroventa', 'valorRetroventa', 'number'],
];
const FIELD_HEADERS = new Set(FIELD_MAP.map(([h]) => h));

function isPercentFormatted(ws, colLetter) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cell = ws[colLetter + (r + 1)];
    if (cell && cell.v !== undefined && cell.v !== null) return typeof cell.w === 'string' && cell.w.includes('%');
  }
  return true;
}

function parseContratos(filePath) {
  const workbook = XLSX.readFile(filePath);
  const { name, ws } = pickSheetByHeaders(workbook, FIELD_HEADERS);
  console.log('Hoja detectada:', name);
  const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, range: 0 })[0] || [];
  const pctColIdx = headerRow.findIndex((h) => normalizeHeader(h || '') === 'porcentaje retroventa');
  const pctIsFraction = pctColIdx === -1 ? true : isPercentFormatted(ws, XLSX.utils.encode_col(pctColIdx));
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  const contratos = [];
  for (const row of rows) {
    const contrato = mapRow(normalizedRow(row), FIELD_MAP);
    if (!contrato.contratoSecuencia) continue;
    if (!pctIsFraction && contrato.porcentajeRetroventa !== undefined) contrato.porcentajeRetroventa /= 100;
    contratos.push(contrato);
  }
  return contratos;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('Uso: node scripts/importContratosResumen.js "ruta/archivo.xlsx"'); process.exit(1); }

  admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
  const db = admin.firestore();

  console.log('Leyendo y parseando', filePath, '...');
  const contratos = parseContratos(filePath);
  console.log('Contratos en el archivo:', contratos.length);

  const { computeAggregates } = await import('../src/lib/contratosAggregates.js');
  const aggregates = computeAggregates(contratos);
  console.log('Indicadores calculados. Sociedades:', aggregates.porSociedad.length, '| Sucursales:', aggregates.porSucursal.length);

  await db.collection('contratos_resumen').doc('actual').set({
    generadoEn: Date.now(),
    archivo: require('path').basename(filePath),
    totalContratosArchivo: contratos.length,
    ...aggregates,
  });

  console.log('Listo. Guardado en contratos_resumen/actual.');
  process.exit(0);
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });

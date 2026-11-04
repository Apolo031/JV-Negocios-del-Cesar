// Uso:  node scripts/replaceContratos.js "ruta/INFORME CONTRATOS (MES).xlsx"
//
// Reemplaza TODA la coleccion "contratos" de Firestore: borra lo que haya y
// carga de cero la hoja de datos del archivo (se detecta automaticamente,
// igual que hace la pantalla de "Importar informe de contratos"). Pensado
// para la carga mensual: cada mes se sube un informe nuevo que reemplaza por
// completo al anterior, no se acumula historico.

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const XLSX = require('xlsx');

const WRITE_CHUNK = 450;

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_KEY en .env.local');
  return JSON.parse(raw);
}

// ---- Portado de src/lib/importHelpers.js ----

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
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}${m[4] ? ' ' + m[4] : ''}`;
  return s || null;
}

function slugifyId(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
    if (!best || matches > best.matches || (matches === best.matches && rowCount > best.rowCount)) {
      best = { name, matches, rowCount };
    }
  }
  return best ? { name: best.name, ws: workbook.Sheets[best.name] } : { name: workbook.SheetNames[0], ws: workbook.Sheets[workbook.SheetNames[0]] };
}

// ---- FIELD_MAP de src/lib/contratosParser.js ----
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
  if (!filePath) {
    console.error('Uso: node scripts/replaceContratos.js "ruta/archivo.xlsx"');
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
  const db = admin.firestore();

  console.log('Leyendo y parseando', filePath, '...');
  const contratos = parseContratos(filePath);
  console.log('Contratos en el archivo:', contratos.length);

  console.log('Borrando la cartera anterior...');
  let borrados = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await db.collection('contratos').limit(WRITE_CHUNK).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    borrados += snap.size;
    console.log(`Borrados: ${borrados}`);
  }
  console.log('Total borrados:', borrados);

  console.log('Cargando la cartera nueva...');
  let cargados = 0;
  for (let i = 0; i < contratos.length; i += WRITE_CHUNK) {
    const slice = contratos.slice(i, i + WRITE_CHUNK);
    const batch = db.batch();
    for (const contrato of slice) {
      batch.set(db.collection('contratos').doc(slugifyId(contrato.contratoSecuencia)), contrato);
    }
    await batch.commit();
    cargados += slice.length;
    if (cargados % 4500 === 0 || cargados === contratos.length) console.log(`Cargados: ${cargados}/${contratos.length}`);
  }

  const finalSnap = await db.collection('contratos').count().get();
  console.log('Listo. Total de contratos en Firestore ahora:', finalSnap.data().count);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

// Uso:  node scripts/importContratosOctubre.js "ruta/INFORME CONTRATOS (OCTUBRE).xlsx"
//
// Carga en la coleccion "contratos" de Firestore el historico de la hoja
// "REPORT CONTRATOS" del informe de octubre, SIN pisar lo que ya esta mas
// fresco (cargado hasta el 3 de noviembre via Consolidado.xlsx):
//   - Contrato que NO existe todavia (por "Contrato Secuencia"): se crea completo.
//   - Contrato que YA existe: solo se completan los campos sociedad/jefeZona/
//     codJoyeria (que el informe de octubre si trae y Consolidado no traia),
//     sin tocar estado, valor, fechas ni ningun otro campo ya cargado.
//
// Reproduce exactamente la misma logica de normalizacion/parseo que
// src/lib/contratosParser.js + src/lib/importHelpers.js (usados por la
// importacion desde el navegador), para que los documentos queden iguales.

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const XLSX = require('xlsx');

const SHEET_NAME = 'REPORT CONTRATOS';
const WRITE_CHUNK = 450;

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_KEY en .env.local');
  return JSON.parse(raw);
}

// ---- Portado de src/lib/importHelpers.js (mismas reglas, para Node/CommonJS) ----

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
    if (raw === undefined && Object.prototype.hasOwnProperty.call(out, field)) continue;
    if (type === 'number') out[field] = parseNumber(raw);
    else if (type === 'percent') out[field] = parsePercent(raw);
    else if (type === 'date') out[field] = parseDate(raw);
    else out[field] = raw === null || raw === undefined ? '' : String(raw).trim();
  }
  return out;
}

// ---- Portado de FIELD_MAP de src/lib/contratosParser.js ----
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
  const ws = workbook.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`No se encontro la hoja "${SHEET_NAME}" en el archivo.`);

  const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, range: 0 })[0] || [];
  const pctColIdx = headerRow.findIndex((h) => normalizeHeader(h || '') === 'porcentaje retroventa');
  const pctIsFraction = pctColIdx === -1 ? true : isPercentFormatted(ws, XLSX.utils.encode_col(pctColIdx));

  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });

  const contratos = [];
  for (const row of rows) {
    const contrato = mapRow(normalizedRow(row), FIELD_MAP);
    if (!contrato.contratoSecuencia) continue;
    if (!pctIsFraction) contrato.porcentajeRetroventa /= 100;
    contratos.push(contrato);
  }
  return contratos;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: node scripts/importContratosOctubre.js "ruta/archivo.xlsx"');
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
  const db = admin.firestore();

  console.log('Leyendo y parseando', filePath, '...');
  const contratos = parseContratos(filePath);
  console.log('Contratos en el archivo:', contratos.length);

  console.log('Listando documentos existentes en Firestore ("contratos")...');
  const existingRefs = await db.collection('contratos').listDocuments();
  const existingIds = new Set(existingRefs.map((r) => r.id));
  console.log('Documentos ya existentes:', existingIds.size);

  let toCreate = 0;
  let toBackfill = 0;
  let skippedNoNewFields = 0;

  const writes = []; // { type: 'set'|'update', id, data }
  for (const contrato of contratos) {
    const id = slugifyId(contrato.contratoSecuencia);
    if (!existingIds.has(id)) {
      writes.push({ type: 'set', id, data: contrato });
      toCreate++;
    } else {
      const patch = {};
      if (contrato.sociedad) patch.sociedad = contrato.sociedad;
      if (contrato.jefeZona) patch.jefeZona = contrato.jefeZona;
      if (contrato.codJoyeria) patch.codJoyeria = contrato.codJoyeria;
      if (Object.keys(patch).length > 0) {
        writes.push({ type: 'update', id, data: patch });
        toBackfill++;
      } else {
        skippedNoNewFields++;
      }
    }
  }

  console.log(`A crear (nuevos, historico): ${toCreate}`);
  console.log(`A completar (sociedad/jefeZona/codJoyeria en existentes): ${toBackfill}`);
  console.log(`Sin cambios (ya existian y sin campos nuevos que aportar): ${skippedNoNewFields}`);
  console.log(`Total operaciones de escritura: ${writes.length}`);

  let done = 0;
  for (let i = 0; i < writes.length; i += WRITE_CHUNK) {
    const slice = writes.slice(i, i + WRITE_CHUNK);
    const batch = db.batch();
    for (const w of slice) {
      const ref = db.collection('contratos').doc(w.id);
      if (w.type === 'set') batch.set(ref, w.data);
      else batch.update(ref, w.data);
    }
    await batch.commit();
    done += slice.length;
    if (done % 4500 === 0 || done === writes.length) {
      console.log(`Progreso: ${done}/${writes.length}`);
    }
  }

  const finalSnap = await db.collection('contratos').count().get();
  console.log('Listo. Total de contratos en Firestore ahora:', finalSnap.data().count);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error importando:', err.message);
  process.exit(1);
});

// Importa el archivo de "Inventario" (una fila por pieza de joyería) a
// Firestore. Es un script de un solo uso para correr a mano con Node, NO una
// ruta de API ni algo que corra desde el navegador: la hoja real
// ("BD INV") pesa ~650MB de XML sin comprimir, muy por encima de lo que
// cualquier parser basado en strings (incluido el paquete "xlsx" normal)
// puede manejar de una sola vez — Node ni siquiera puede convertir ese XML
// a un string (supera el límite de ~536M caracteres de V8).
//
// La solución: leer el .xlsx como el ZIP que es, descomprimir la hoja en
// streaming (yauzl) y extraer las filas completas <row>...</row> del buffer
// a medida que van llegando, sin acumular nunca más que unos pocos KB sin
// procesar. Las celdas de texto se resuelven contra xl/sharedStrings.xml
// (ese sí cabe entero en memoria, ~10MB).
//
// Uso:
//   node scripts/importInventario.mjs <archivo.xlsx> <serviceAccount.json> [--dry-run]
//
// --dry-run solo cuenta/valida filas y muestra una muestra, sin escribir
// nada a Firestore. Úsalo siempre primero.

import fs from 'fs';
import yauzl from 'yauzl';
import admin from 'firebase-admin';
import { parseNumber, parseDate, slugifyId } from '../src/lib/importHelpers.js';

const [, , XLSX_PATH, SERVICE_ACCOUNT_PATH] = process.argv;
const DRY_RUN = process.argv.includes('--dry-run');
const CHUNK = 450; // límite de Firestore por batch es 500

if (!XLSX_PATH || (!DRY_RUN && !SERVICE_ACCOUNT_PATH)) {
  console.error('Uso: node scripts/importInventario.mjs <archivo.xlsx> <serviceAccount.json> [--dry-run]');
  process.exit(1);
}

// [columna, campo, tipo] — columnas A..AE de la hoja "BD INV".
const FIELD_MAP = [
  ['A', 'sociedad', 'string'],
  ['B', 'jefeZona', 'string'],
  ['C', 'ciudad', 'string'],
  ['D', 'calidadJoya', 'string'],
  ['E', 'joyeria', 'string'],
  ['F', 'codigoJoyeria', 'string'],
  ['G', 'sku', 'string'],
  ['H', 'etiquetaOrigen', 'string'],
  ['I', 'descripcion', 'string'],
  ['J', 'gramos', 'number'],
  ['K', 'costoTotal', 'number'],
  ['L', 'precioVenta', 'number'],
  ['M', 'estado', 'string'],
  ['N', 'origen', 'string'],
  ['O', 'procedencia', 'string'],
  ['P', 'procedenciaReferencia', 'string'],
  ['Q', 'cantidadDisponible', 'number'],
  ['R', 'fechaIngreso', 'date'],
  ['S', 'categoriaGeneral', 'string'],
  ['T', 'familia', 'string'],
  ['U', 'calidad', 'string'],
  ['V', 'operacionSecuencia', 'string'],
  ['W', 'tipoInventario', 'string'],
  ['X', 'fechaFin', 'date'],
  ['Y', 'diasInventario', 'number'],
  ['Z', 'edadInventario', 'string'],
  ['AA', 'edadMenor365', 'number'],
  ['AB', 'edad365a540', 'number'],
  ['AC', 'edad540a720', 'number'],
  ['AD', 'edadMayor720', 'number'],
  ['AE', 'promCosto', 'number'],
];

function decodeXmlEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function parseSharedStrings(xml) {
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXmlEntities(x[1]));
    out.push(texts.join(''));
  }
  return out;
}

/** Celdas <c ...>...</c> / <c .../> de una fila -> {col: {type, value}|null}. */
function parseRowCells(rowXml) {
  const row = {};
  const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = cellRe.exec(rowXml))) {
    const attrs = m[1];
    const inner = m[2] || '';
    const col = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1];
    if (!col) continue;
    const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || 'n';
    const vMatch = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
    row[col] = vMatch ? { type, value: decodeXmlEntities(vMatch[1]) } : null;
  }
  return row;
}

function cellToField(cell, sst, type) {
  if (!cell || cell.value === null || cell.value === undefined) return type === 'number' ? 0 : (type === 'date' ? null : '');
  const raw = cell.type === 's' ? sst[parseInt(cell.value, 10)] : cell.value;
  if (type === 'number') return parseNumber(raw);
  if (type === 'date') {
    const n = Number(raw);
    return parseDate(raw !== null && raw !== '' && !isNaN(n) ? n : raw);
  }
  return raw === null || raw === undefined ? '' : String(raw).trim();
}

function openReadStream(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream)));
  });
}

async function readEntryFully(zipfile, entry) {
  const stream = await openReadStream(zipfile, entry);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** Encuentra una entrada del zip por nombre exacto, abriendo el archivo con lazyEntries. */
function findEntries(zipPath, names) {
  return new Promise((resolve, reject) => {
    // autoClose:false — por default yauzl cierra el fd del zip en cuanto se
    // terminan de listar las entradas ("end"), antes de que podamos abrir un
    // readStream sobre la que encontramos.
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
      if (err) return reject(err);
      const found = {};
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (names.includes(entry.fileName)) found[entry.fileName] = entry;
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve({ zipfile, found }));
      zipfile.on('error', reject);
    });
  });
}

/** La hoja de datos es, de lejos, la más pesada del libro (resúmenes aparte). */
function findBiggestWorksheetName(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      let best = null;
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.fileName)) {
          if (!best || entry.uncompressedSize > best.uncompressedSize) best = entry;
        }
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve(best));
      zipfile.on('error', reject);
    });
  });
}

async function main() {
  console.log('Buscando la hoja de datos más pesada del libro...');
  const sheetEntryGuess = await findBiggestWorksheetName(XLSX_PATH);
  console.log(`  -> ${sheetEntryGuess.fileName} (${(sheetEntryGuess.uncompressedSize / 1e6).toFixed(1)} MB sin comprimir)`);

  console.log('Cargando xl/sharedStrings.xml...');
  const { zipfile: zf1, found: f1 } = await findEntries(XLSX_PATH, ['xl/sharedStrings.xml']);
  const sstXml = await readEntryFully(zf1, f1['xl/sharedStrings.xml']);
  const sst = parseSharedStrings(sstXml);
  console.log(`  -> ${sst.length} strings compartidos.`);

  let db = null;
  if (!DRY_RUN) {
    const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
  }

  const { zipfile: zf2, found: f2 } = await findEntries(XLSX_PATH, [sheetEntryGuess.fileName]);
  const stream = await openReadStream(zf2, f2[sheetEntryGuess.fileName]);

  let buffer = '';
  let headerSeen = false;
  let rowCount = 0;
  let sampleLogged = 0;
  let batch = [];
  // Acumuladores para un resumen (evita tener que recorrer 339K docs luego).
  const resumen = { total: 0, gramosTotal: 0, costoTotal: 0, valorVentaTotal: 0, porSociedad: {}, porEstado: {}, porEdad: {}, porCiudad: {}, porCategoria: {} };

  async function flushBatch() {
    if (DRY_RUN || batch.length === 0) { batch = []; return; }
    const wb = db.batch();
    for (const item of batch) wb.set(db.collection('inventario').doc(item.__id), item.__data);
    await wb.commit();
    batch = [];
  }

  async function processRow(rowXml) {
    const cells = parseRowCells(rowXml);
    const colA = cells.A ? (cells.A.type === 's' ? sst[parseInt(cells.A.value, 10)] : cells.A.value) : null;
    if (!headerSeen) {
      if (colA === 'SOCIEDAD') headerSeen = true;
      return; // fila de título o de encabezado — no es un dato
    }
    const item = {};
    for (const [col, field, type] of FIELD_MAP) item[field] = cellToField(cells[col], sst, type);
    if (!item.sku) return; // fila vacía al final de la hoja

    resumen.total++;
    resumen.gramosTotal += item.gramos || 0;
    resumen.costoTotal += item.costoTotal || 0;
    resumen.valorVentaTotal += item.precioVenta || 0;
    resumen.porSociedad[item.sociedad] = (resumen.porSociedad[item.sociedad] || 0) + 1;
    resumen.porEstado[item.estado] = (resumen.porEstado[item.estado] || 0) + 1;
    resumen.porEdad[item.edadInventario] = (resumen.porEdad[item.edadInventario] || 0) + 1;
    resumen.porCiudad[item.ciudad] = (resumen.porCiudad[item.ciudad] || 0) + 1;
    resumen.porCategoria[item.categoriaGeneral] = (resumen.porCategoria[item.categoriaGeneral] || 0) + 1;

    rowCount++;
    if (sampleLogged < 2) { console.log('Muestra:', JSON.stringify(item)); sampleLogged++; }

    batch.push({ __id: slugifyId(item.sku), __data: item });
    if (batch.length >= CHUNK) await flushBatch();
    if (rowCount % 20000 === 0) console.log(`  ${rowCount} filas procesadas...`);
  }

  for await (const chunk of stream) {
    buffer += chunk.toString('utf8');
    let rowStart;
    while ((rowStart = buffer.indexOf('<row ')) !== -1) {
      const rowEnd = buffer.indexOf('</row>', rowStart);
      if (rowEnd === -1) break; // la fila sigue en el siguiente chunk
      const rowXml = buffer.slice(rowStart, rowEnd + 6);
      await processRow(rowXml);
      buffer = buffer.slice(rowEnd + 6);
    }
  }
  await flushBatch();

  console.log('\n=== RESUMEN ===');
  console.log('Total filas de datos:', rowCount);
  console.log('Gramos totales:', resumen.gramosTotal.toFixed(2));
  console.log('Costo total:', resumen.costoTotal.toFixed(2));
  console.log('Por sociedad:', resumen.porSociedad);
  console.log('Por estado:', resumen.porEstado);
  console.log('Por edad de inventario:', resumen.porEdad);

  if (!DRY_RUN) {
    await db.collection('inventario_meta').doc('resumen').set({
      ...resumen,
      generadoEl: new Date().toISOString(),
      archivo: XLSX_PATH.split(/[\\/]/).pop(),
    });
    console.log('Resumen guardado en inventario_meta/resumen.');
  }
  console.log(DRY_RUN ? 'DRY RUN — no se escribió nada en Firestore.' : 'Listo.');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });

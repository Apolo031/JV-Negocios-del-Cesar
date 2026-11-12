// Parser del Excel maestro "CONTRATOS GEOLOCALIZACION" de Zona Centro
// Inmobiliaria. La ÚNICA hoja que se usa es "COLOMBIA" (la base que mantiene
// el equipo): un inmueble por fila, ocupado (ACTIVOS) o vacante (DISPONIBLE),
// con sociedad, grupo, tipo de inmueble, metros², canon al 100 %, hasta 6
// propietarios (con su % y su canon y quién administra), el seguro y el
// incremento. El detalle de la hoja se lee en colombiaSheet.js.
//
// El archivo NO trae coordenadas (ni latitud/longitud ni link de mapa) — cada
// fila ya trae dirección + municipio, suficiente para ubicarlo en un mapa bajo
// demanda (ver urlMapa). Igual que el resto de parsers del panel, esto corre
// en el NAVEGADOR (la carga va directo a Firestore desde el cliente).

import * as XLSX from 'xlsx';
import { readWorkbook, parseNumber, stripAccents, slugifyId } from './importHelpers';
import { leerFilasColombia } from './colombiaSheet';

const COLOMBIA_HOJA_RE = /^COLOMBIA/i;

/** Agrupa variantes de un mismo municipio ("Medellín" / "MEDELLIN") bajo una sola clave. */
export function normalizarMunicipio(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s && s.toUpperCase() !== '#N/A' ? stripAccents(s).toUpperCase() : null;
}

/** Un inmueble (con la forma que espera Base principal) a partir de una fila de COLOMBIA. */
function inmuebleDesdeColombia(zc, id) {
  const activo = (zc.ocupacion || '').toUpperCase() === 'ACTIVOS';
  const propietarios = zc.propietarios.map((p) => ({
    nombre: p.nombre, participacion: p.porcentaje, canon: p.canon, administradoPor: p.administradoPor,
  }));
  return {
    id,
    contrato: parseNumber(zc.contrato) || null,
    activo,
    ocupacion: zc.ocupacion,
    propietario: propietarios[0]?.nombre || null,
    inquilino: zc.arrendatario,
    direccion: zc.direccion,
    municipio: zc.municipio,
    municipioNormalizado: normalizarMunicipio(zc.municipio),
    clase: zc.tipoInmueble,
    tipoInmueble: zc.tipoInmueble,
    grupo: zc.grupo,
    sociedad: zc.sociedad,
    metros2: zc.metros2,
    observaciones: zc.observaciones,
    observacionesZc: zc.observaciones,
    canon: zc.canon100,
    canon100: zc.canon100,
    propietarios,
    distribucionCanon: zc.propietarios,
    aseguradora: zc.seguro.aseguradora,
    seguro: zc.seguro,
    incremento: zc.incremento,
    diaIncremento: zc.diaIncremento,
    mesIncremento: zc.mesIncremento,
    mesNombre: zc.mesNombre,
    alertasDatos: zc.alertas,
    raw: zc.raw,
  };
}

export function parseInmueblesBuffer(bufferOrBytes) {
  const wb = readWorkbook(bufferOrBytes);
  const nombreHoja = wb.SheetNames.find((n) => COLOMBIA_HOJA_RE.test(n.trim()));
  if (!nombreHoja) {
    throw new Error('No se encontró la hoja "COLOMBIA" en el archivo (se esperaba la base de contratos con OCUPACION, CONTRATO, CANON 100%, PROPETARIO 1…).');
  }
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: null });
  const { contratos, avisos } = leerFilasColombia(filas);
  if (contratos.length === 0) {
    throw new Error(avisos[0] || 'La hoja COLOMBIA no tiene contratos.');
  }

  // Id estable: el número de contrato. Los que no lo traen (el texto "N" de
  // los disponibles) se arman con dirección + municipio. Si un mismo id se
  // repite (por ejemplo un contrato digitado dos veces en la hoja) el
  // segundo lleva sufijo y queda marcado para revisar, sin pisar al primero.
  const usados = new Set();
  const sinPisar = (base) => {
    let id = base, n = 2;
    while (usados.has(id)) id = `${base}-${n++}`;
    usados.add(id);
    return { id, repetido: id !== base };
  };

  return contratos.map((zc, i) => {
    const numero = parseNumber(zc.contrato);
    const prefijo = (zc.ocupacion || '').toUpperCase() === 'ACTIVOS' ? 'act' : 'disp';
    const idBase = numero
      ? String(numero)
      : `${prefijo}-${[zc.direccion, zc.municipio].filter(Boolean).map((x) => slugifyId(stripAccents(x))).join('-') || i}`;
    const { id, repetido } = sinPisar(idBase);
    const inmueble = inmuebleDesdeColombia(zc, id);
    if (repetido && numero) inmueble.alertasDatos = [...inmueble.alertasDatos, `El contrato ${numero} está repetido en la hoja COLOMBIA`];
    return inmueble;
  });
}

/** Link de Google Maps a partir de la dirección + municipio (el archivo no trae coordenadas). */
export function urlMapa(direccion, municipio) {
  const partes = [direccion, municipio, 'Colombia'].filter(Boolean).join(', ');
  if (!partes) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partes)}`;
}

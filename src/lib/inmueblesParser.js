// Parser del Excel maestro de "CONTRATOS GEOLOCALIZACION" de Zona Centro
// Inmobiliaria. El archivo trae varias hojas (resúmenes, pivotes, tablas de
// apoyo); la que importa es la hoja "BS-ACTIVOS ..." (el nombre trae la
// fecha de corte pegada, ej. "BS-ACTIVOS 22-01-26", así que se busca por
// prefijo), que es el export completo del software de administración de
// arriendos: un contrato por fila, con el inmueble, el propietario, el
// arrendatario, hasta 4 coarrendatarios, el seguro y los datos de pago.
//
// El archivo NO trae coordenadas (ni latitud/longitud ni link de mapa) — el
// nombre "GEOLOCALIZACION" se refiere a que cada fila ya trae dirección +
// municipio, suficiente para ubicarlo en un mapa bajo demanda (ver
// urlMapa). Igual que el resto de parsers del panel, esto corre en el
// NAVEGADOR (la carga va directo a Firestore desde el cliente).

import * as XLSX from 'xlsx';
import { readWorkbook, parseNumber, parseDate, stripAccents } from './importHelpers';

const HOJA_RE = /^BS-ACTIVOS/i;

function limpiar(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === '/ /' || s === '##########' ? null : s;
}

function esVerdadero(v) {
  return v === true || String(v).trim().toUpperCase() === 'VERDADERO';
}

/** Agrupa variantes de un mismo municipio ("Medellín" / "MEDELLIN") bajo una sola clave. */
export function normalizarMunicipio(v) {
  const s = limpiar(v);
  return s ? stripAccents(s).toUpperCase() : null;
}

function coarrendatario(row, i) {
  const nombre = limpiar(row[`Nombre_coarrendatario${i}`]);
  if (!nombre || nombre.toUpperCase().includes('SIN COARRENDATARIO')) return null;
  return {
    cedula: limpiar(row[`Ced_Coarrendatario${i}`]),
    nombre,
    telefonoRes: limpiar(row[`Telefono_Res_Coarrendatario${i}`]),
    telefonoOf: limpiar(row[`Telefono_Of_Coarrendatario${i}`]),
    celular: limpiar(row[`Celular_Coarrendatario${i}`]),
    direccion: limpiar(row[`Direccion_Coarrendatario${i}`]),
    municipio: limpiar(row[`Municipio_Coarrendatario${i}`]),
    email: limpiar(row[`Email_Coarrendatario${i}`]),
  };
}

/**
 * El propietario puede estar dividido entre varios dueños con distinto
 * porcentaje (hasta 13 "copropietarios" en el Excel, además del propietario
 * principal). Cada uno puede además tener un beneficiario de pago distinto
 * (a quién se le consigna, no necesariamente al dueño).
 */
function copropietario(row, i) {
  const nombre = limpiar(row[`Nombre_Copropietario_${i}`]);
  if (!nombre) return null;
  return {
    cedula: limpiar(row[`Nro_id_Copropietario_${i}`]),
    nombre,
    participacion: parseNumber(row[`Participacion_Copropietario_${i}`]),
    beneficiario: {
      nroId: limpiar(row[`Nro_id_Beneficiario_Copropietario_${i}`]),
      nombre: limpiar(row[`Nombre_Beneficiario_Copropietario_${i}`]),
      cuenta: limpiar(row[`Consignar_cta_Beneficiario_Copropietario_${i}`]),
      codigoACH: limpiar(row[`Codigo_ACH_Beneficiario_Copropietario_${i}`]),
      tipoCuenta: limpiar(row[`Tipo_Cuenta_Beneficiario_Copropietario_${i}`]),
      banco: limpiar(row[`Banco_Beneficiario_Copropietario_${i}`]),
    },
  };
}

/** Copia la fila completa tal cual (para no perder ningún dato que no se mapeó arriba). */
function filaCompleta(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

export function parseInmueblesBuffer(bufferOrBytes) {
  const wb = readWorkbook(bufferOrBytes);
  const nombreHoja = wb.SheetNames.find((n) => HOJA_RE.test(n.trim()));
  if (!nombreHoja) {
    throw new Error('No se encontró la hoja "BS-ACTIVOS..." en el archivo (se esperaba el reporte completo de contratos de arrendamiento).');
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { defval: null });

  return rows
    .filter((r) => r.Contrato !== null && r.Contrato !== undefined && r.Contrato !== '')
    .map((row) => ({
      id: String(row.Contrato).trim(),
      contrato: parseNumber(row.Contrato),
      activo: esVerdadero(row.Activo),
      propietario: limpiar(row.nombre_Propietario),
      inquilino: limpiar(row.Nombre_Inquilino),
      direccion: limpiar(row.Dir_Inmueble),
      municipio: limpiar(row.Municipio_Inmueble),
      municipioNormalizado: normalizarMunicipio(row.Municipio_Inmueble),
      barrio: limpiar(row.Barrio_inmueble),
      urbanizacion: limpiar(row.Urbanizacion_Inmueble),
      estrato: limpiar(row.Estrato_Inmueble),
      zona: limpiar(row.Zona),
      clase: limpiar(row.Clase),
      tipoContrato: limpiar(row.TipoContrato),
      destinacionComercial: limpiar(row.DestinacionComercial),
      grupo: limpiar(row.grupo),
      asesor: limpiar(row.Nombre_Asesor),
      auxiliar: limpiar(row.Nombre_Auxiliar),
      canon: parseNumber(row.Canon),
      valorAdministracion: parseNumber(row.ValorAdministracion),
      porcentajeComision: parseNumber(row.Porcentaje_comision),
      comisionCanon: parseNumber(row.Comision_Canon),
      comisionMasIva: parseNumber(row.Comision_mas_Iva),
      duracionContrato: limpiar(row.Duracion_Contrato),
      fechaContrato: parseDate(row.fecha_contrato),
      fechaFinContrato: parseDate(row.Fecha_fin_contrato),
      fechaIncremento: parseDate(row.Fecha_Incremento),
      telInmueble: limpiar(row.Tel_Inmueble),
      aseguradora: limpiar(row.Nombre_Aseguradora),
      siniestrado: esVerdadero(row.Siniestrado),
      propietarioDoc: {
        nroId: limpiar(row.Nro_id_propietario),
        participacion: parseNumber(row.Participacion_Prop),
        direccion: limpiar(row.Dir_Propietario),
        municipio: limpiar(row.Municipio_Prop),
        telefonoRes: limpiar(row.telefono_res_Prop),
        telefonoOf: limpiar(row.telefono_of_prop),
        celular: limpiar(row.Celular_Prop),
        email: limpiar(row.Email_Prop),
        emailFacturacion: limpiar(row.Email_Facturacion_Prop),
        banco: limpiar(row.Banco_Prop),
        tipoCuenta: limpiar(row.Tipo_Cuenta_Prop),
        cuenta: limpiar(row.Consignar_cta_Prop),
      },
      inquilinoDoc: {
        nroId: limpiar(row.Nro_id_Inquilino),
        celular: limpiar(row.Celular_Inq),
        telOtros: limpiar(row.Tel_Otros_Inq),
        telOf: limpiar(row.Tel_Of_Inq),
        email: limpiar(row.Email_Inq),
        emailFacturacion: limpiar(row.Email_Facturacion_Inq),
        direccionCorrespondencia: limpiar(row.Dir_Correspondencia_Inq),
        municipioCorrespondencia: limpiar(row.Municipio_Correspondencia_Inq),
      },
      coarrendatarios: [1, 2, 3, 4].map((i) => coarrendatario(row, i)).filter(Boolean),
      copropietarios: Array.from({ length: 13 }, (_, i) => copropietario(row, i + 1)).filter(Boolean),
      observaciones: limpiar(row.Observaciones),
      raw: filaCompleta(row),
    }));
}

/** Link de Google Maps a partir de la dirección + municipio (el archivo no trae coordenadas). */
export function urlMapa(direccion, municipio) {
  const partes = [direccion, municipio, 'Colombia'].filter(Boolean).join(', ');
  if (!partes) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partes)}`;
}

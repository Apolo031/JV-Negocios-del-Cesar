// Parser de los dos reportes de caja que genera OROEXPRESS/SINNUT:
//
//  - "MOVIMIENTOS DE CAJA CONSOLIDADOS": el acumulado de todo un periodo
//    (normalmente un mes) por sucursal. El valor que trae ya es el total
//    del periodo, así que en "Editar datos" reemplaza directo el valor del
//    mes.
//  - "CUADRE DE CAJA": el cierre de UN SOLO DÍA. En "Editar datos" se suma
//    al valor que ya hay guardado para ese mes, para ir construyendo el mes
//    día a día con los cuadres que se van subiendo.
//
// El texto que se extrae del PDF NO trae la etiqueta pegada a su valor: cada
// "caja" del reporte (ej. INGRESOS > Contratos) imprime primero todas sus
// etiquetas ("Utilidad:", "Prórrogas:", ...) seguidas, y luego, en el mismo
// orden, todos sus valores — así quedó compaginado el PDF original, no es
// un formato de línea por línea. Esto es igual en los dos reportes, así que
// la misma función de posición sirve para ambos.
//
// Las tablas "DETALLE ..." sí traen los números pegados a la descripción en
// la misma línea, y siempre cierran con una fila "TOTAL: n1 n2 n3...". Los
// nombres exactos de esas tablas varían un poco entre los dos reportes (p.
// ej. "DETALLE VENTAS ORO" vs "DETALLE DE VENTAS ORO"), por eso cada formato
// tiene su propia lista de encabezados.

/** Formato colombiano: punto = separador de miles, coma = decimales. */
function parseNumeroCol(s) {
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

const NUM_RE = /^-?[\d.]+,\d{2}$/;

/** Busca "etiqueta:" en su bloque de etiquetas y devuelve el valor en la misma posición del bloque de valores que sigue. */
function valorDeEtiqueta(lines, etiqueta) {
  const i = lines.indexOf(etiqueta);
  if (i === -1) return null;
  let start = i;
  while (start > 0 && /:$/.test(lines[start - 1])) start--;
  let end = i + 1;
  while (end < lines.length && /:$/.test(lines[end])) end++;
  const posicion = i - start;
  const valorIdx = end + posicion;
  if (valorIdx >= lines.length || !NUM_RE.test(lines[valorIdx])) return null;
  return parseNumeroCol(lines[valorIdx]);
}

/** Toma los números de la fila "TOTAL:" de la tabla que empieza en alguno de los `encabezados` posibles. */
function totalesDeSeccion(lines, encabezados) {
  for (const encabezado of encabezados) {
    const i = lines.indexOf(encabezado);
    if (i === -1) continue;
    for (let j = i + 1; j < lines.length && j < i + 40; j++) {
      if (lines[j].startsWith('TOTAL:')) {
        const nums = lines[j].match(/-?[\d.]+,\d{2}/g) || [];
        return nums.map(parseNumeroCol);
      }
    }
  }
  return null;
}

const BRANCH_KEYWORDS = [
  ['BARRANQUILLA', 'Barranquilla'], ['CAUCASIA', 'Caucasia'], ['EURO', 'Euro'],
  ['HEROICA', 'Heroica'], ['SINU', 'Sinú'], ['LA 5', 'La 5'], ['LA5', 'La 5'],
];

function detectarSucursalYCodigo(lines) {
  const codigoLine = lines.find((l) => /^\d+-\d+-[A-ZÁÉÍÓÚÑ ]+$/.test(l));
  let sucursal = null;
  if (codigoLine) {
    const norm = codigoLine.toUpperCase();
    const found = BRANCH_KEYWORDS.find(([kw]) => norm.includes(kw));
    if (found) sucursal = found[1];
  }
  return { sucursal, codigoDetectado: codigoLine || null };
}

/**
 * "Fecha inicio: 01/09/2026 Fecha fin: 30/09/2026" → fecha de inicio (dia/
 * mes/anio, igual que antes) más fecha de fin (diaFin/mesFin/anioFin) y
 * `multiMes`, para poder avisar cuando el periodo del reporte cruza de un
 * mes a otro — en ese caso el total no corresponde a un solo mes de
 * "Editar datos" y hay que revisarlo a mano antes de aplicarlo.
 */
function detectarFecha(lines) {
  const vacio = { dia: null, mes: null, anio: null, diaFin: null, mesFin: null, anioFin: null, multiMes: false };
  const fechaLine = lines.find((l) => l.startsWith('Fecha inicio:'));
  if (!fechaLine) return vacio;
  const mIni = fechaLine.match(/Fecha inicio:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const mFin = fechaLine.match(/Fecha fin:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!mIni) return vacio;
  const dia = parseInt(mIni[1], 10), mes = parseInt(mIni[2], 10), anio = mIni[3];
  if (!mFin) return { dia, mes, anio, diaFin: null, mesFin: null, anioFin: null, multiMes: false };
  const diaFin = parseInt(mFin[1], 10), mesFin = parseInt(mFin[2], 10), anioFin = mFin[3];
  return { dia, mes, anio, diaFin, mesFin, anioFin, multiMes: mes !== mesFin || anio !== anioFin };
}

function extraerIndicadores(lines, headers) {
  const utilidad = valorDeEtiqueta(lines, 'Utilidad:') ?? 0;
  const prorroga = valorDeEtiqueta(lines, 'Prórrogas:') ?? 0;

  const oro = totalesDeSeccion(lines, headers.contratosOro) || [0, 0, 0];
  const plataGramos = totalesDeSeccion(lines, headers.contratosPlataGramos) || [0, 0, 0];
  const ventasOro = totalesDeSeccion(lines, headers.ventasOro) || [0, 0, 0, 0, 0, 0];
  const ventasPlata = totalesDeSeccion(lines, headers.ventasPlataGramos) || [0, 0, 0, 0, 0, 0];

  return {
    valores: {
      utilidad,
      prorroga,
      gr_contrato: oro[0],
      valor_contratado: oro[1],
      venta_oro: ventasOro[0],
      valor_venta_oro: ventasOro[ventasOro.length - 1],
      venta_plata: ventasPlata[0],
      valor_venta_plata: ventasPlata[ventasPlata.length - 1],
    },
    detalle: {
      contratosOro: { gramos: oro[0], valorArticulos: oro[1], promedio: oro[2] },
      contratosPlataGramos: { gramos: plataGramos[0], valorArticulos: plataGramos[1], promedio: plataGramos[2] },
      ventasOro: { grm: ventasOro[0], total: ventasOro[ventasOro.length - 1] },
      ventasPlataGramos: { grm: ventasPlata[0], total: ventasPlata[ventasPlata.length - 1] },
    },
  };
}

const HEADERS_CONSOLIDADO = {
  contratosOro: ['DETALLE CONTRATOS ORO'],
  contratosPlataGramos: ['DETALLE CONTRATOS PLATA GRAMOS'],
  ventasOro: ['DETALLE DE VENTAS ORO'],
  ventasPlataGramos: ['DETALLE DE VENTAS PLATA GRAMOS'],
};

const HEADERS_CUADRE = {
  contratosOro: ['DETALLE CONTRATOS ORO'],
  contratosPlataGramos: ['DETALLE CONTRATOS PLATA GRAMOS'],
  ventasOro: ['DETALLE VENTAS ORO'],
  ventasPlataGramos: ['DETALLE VENTAS PLATA GRAMOS'],
};

/**
 * Parsea el texto plano del PDF (todas las páginas concatenadas), detecta
 * de cuál de los dos reportes se trata y devuelve los indicadores que
 * alimentan "Editar datos", más el detalle que los respalda para mostrarlo
 * en la revisión antes de guardar. `tipo` es null si no se reconoció
 * ninguno de los dos formatos.
 */
export function parseCajaPdfText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let tipo = null;
  if (lines.some((l) => l.includes('MOVIMIENTOS DE CAJA CONSOLIDADOS'))) tipo = 'consolidado';
  else if (lines.some((l) => l.includes('CUADRE DE CAJA'))) tipo = 'cuadre';

  const { sucursal, codigoDetectado } = detectarSucursalYCodigo(lines);
  const { dia, mes, anio, diaFin, mesFin, anioFin, multiMes } = detectarFecha(lines);
  const headers = tipo === 'cuadre' ? HEADERS_CUADRE : HEADERS_CONSOLIDADO;
  const { valores, detalle } = extraerIndicadores(lines, headers);

  return { tipo, sucursal, dia, mes, anio, diaFin, mesFin, anioFin, multiMes, codigoDetectado, valores, detalle };
}

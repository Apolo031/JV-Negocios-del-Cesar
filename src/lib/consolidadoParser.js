// Parser del PDF "Movimientos de Caja Consolidados" (reporte de caja
// mensual por sucursal, generado por OROEXPRESS/SINNUT).
//
// El texto que se extrae del PDF NO trae la etiqueta pegada a su valor:
// cada "caja" del reporte (ej. INGRESOS > Contratos) imprime primero todas
// sus etiquetas ("Utilidad:", "Prórrogas:", ...) seguidas, y luego, en el
// mismo orden, todos sus valores — así quedó compaginado el PDF original,
// no es un formato de línea por línea. Por eso la extracción no es un
// regex simple de "etiqueta: valor": hay que encontrar el bloque de
// etiquetas consecutivas al que pertenece una etiqueta, y tomar el valor
// que está en la misma posición dentro del bloque de valores que le sigue.
//
// Las tablas "DETALLE ..." sí traen los números pegados a la descripción
// en la misma línea, y siempre cierran con una fila "TOTAL: n1 n2 n3...".

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

/** Toma los números de la fila "TOTAL:" de la tabla que empieza en `encabezado`. */
function totalesDeSeccion(lines, encabezado) {
  const i = lines.indexOf(encabezado);
  if (i === -1) return null;
  for (let j = i + 1; j < lines.length && j < i + 40; j++) {
    if (lines[j].startsWith('TOTAL:')) {
      const nums = lines[j].match(/-?[\d.]+,\d{2}/g) || [];
      return nums.map(parseNumeroCol);
    }
  }
  return null;
}

const BRANCH_KEYWORDS = [
  ['BARRANQUILLA', 'Barranquilla'], ['CAUCASIA', 'Caucasia'], ['EURO', 'Euro'],
  ['HEROICA', 'Heroica'], ['SINU', 'Sinú'], ['LA 5', 'La 5'], ['LA5', 'La 5'],
];

/**
 * Parsea el texto plano del PDF (todas las páginas concatenadas) y devuelve
 * los indicadores que alimentan "Editar datos", más el detalle que los
 * respalda para mostrarlo en la revisión antes de guardar.
 */
export function parseConsolidadoText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const utilidad = valorDeEtiqueta(lines, 'Utilidad:') ?? 0;
  const prorroga = valorDeEtiqueta(lines, 'Prórrogas:') ?? 0;

  const oro = totalesDeSeccion(lines, 'DETALLE CONTRATOS ORO') || [0, 0, 0];
  const plataGramos = totalesDeSeccion(lines, 'DETALLE CONTRATOS PLATA GRAMOS') || [0, 0, 0];
  const ventasOro = totalesDeSeccion(lines, 'DETALLE DE VENTAS ORO') || [0, 0, 0, 0, 0, 0];
  const ventasPlata = totalesDeSeccion(lines, 'DETALLE DE VENTAS PLATA GRAMOS') || [0, 0, 0, 0, 0, 0];

  // Código de sucursal, ej. "512-512-SINU".
  const codigoLine = lines.find((l) => /^\d+-\d+-[A-ZÁÉÍÓÚÑ ]+$/.test(l));
  let sucursal = null;
  if (codigoLine) {
    const norm = codigoLine.toUpperCase();
    const found = BRANCH_KEYWORDS.find(([kw]) => norm.includes(kw));
    if (found) sucursal = found[1];
  }

  // "Fecha inicio: 01/09/2026 Fecha fin: 30/09/2026"
  const fechaLine = lines.find((l) => l.startsWith('Fecha inicio:'));
  let mes = null, anio = null;
  if (fechaLine) {
    const m = fechaLine.match(/Fecha inicio:\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) { mes = parseInt(m[2], 10); anio = m[3]; }
  }

  return {
    sucursal, mes, anio, codigoDetectado: codigoLine || null,
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
    // Detalle de respaldo, no se guarda — solo para que el admin vea de
    // dónde salió cada número antes de confirmar.
    detalle: {
      contratosOro: { gramos: oro[0], valorArticulos: oro[1], promedio: oro[2] },
      contratosPlataGramos: { gramos: plataGramos[0], valorArticulos: plataGramos[1], promedio: plataGramos[2] },
      ventasOro: { grm: ventasOro[0], total: ventasOro[ventasOro.length - 1] },
      ventasPlataGramos: { grm: ventasPlata[0], total: ventasPlata[ventasPlata.length - 1] },
    },
  };
}

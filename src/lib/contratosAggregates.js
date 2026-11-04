// Calcula los indicadores del informe de contratos a partir de las filas ya
// parseadas (en el navegador, justo después de leer el Excel). El resultado
// es lo único que se guarda en Firestore — unos pocos KB de resúmenes — en
// vez de una fila por contrato (100k+), que es lo que disparaba la cuota de
// lecturas/escrituras de Firestore con un archivo de este tamaño.

// "Joyeria" trae "<código>-<sociedad>" (ej. "013-EFECTIVA"); la sociedad es
// el nombre después del guion, sin el código.
function sociedadOf(joyeria) {
  const s = String(joyeria || '').replace(/^\d+-\s*/, '').trim();
  return s || joyeria || '';
}

// Prefiere el nombre real de "Sociedad" (columna del informe); si el
// contrato no la trae, cae al nombre derivado de la Joyería.
function sociedadReal(c) {
  return c.sociedad || sociedadOf(c.joyeria);
}

// "Contrato Termino" usa la misma columna para dos unidades distintas: los
// contratos de venta directa están a 15 días (no 15 meses), y el resto de
// valores (1, 3, 4, 6...) sí son meses. Se distingue por el valor exacto 15.
function tipoPlazo(termino) {
  if (termino === 15) return 'Venta directa (15 días)';
  return `A término (${termino} ${termino === 1 ? 'mes' : 'meses'})`;
}
const ORDEN_PLAZO = [15, 1, 3, 4, 6];
function ordenPlazo(termino) {
  const i = ORDEN_PLAZO.indexOf(termino);
  return i === -1 ? ORDEN_PLAZO.length + termino : i;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((d - hoy) / (1000 * 60 * 60 * 24));
}

// Mismos rangos de valor que trae el informe de contratos (hoja "CATEGORIAS").
export const RANGOS_VALOR = [
  { desde: 0, hasta: 999999, label: 'Hasta $999.999' },
  { desde: 1000000, hasta: 1999999, label: '$1.000.000 – $1.999.999' },
  { desde: 2000000, hasta: 2999999, label: '$2.000.000 – $2.999.999' },
  { desde: 3000000, hasta: 4999999, label: '$3.000.000 – $4.999.999' },
  { desde: 5000000, hasta: 9999999, label: '$5.000.000 – $9.999.999' },
  { desde: 10000000, hasta: 29999999, label: '$10.000.000 – $29.999.999' },
  { desde: 30000000, hasta: Infinity, label: '$30.000.000 o más' },
];

function rangoValorDe(contratos) {
  const totalContratos = contratos.length;
  const totalValor = contratos.reduce((s, c) => s + (c.contratoValor || 0), 0);
  const totalGramos = contratos.reduce((s, c) => s + (c.contratoGramosEstimados || 0), 0);
  const buckets = RANGOS_VALOR.map((r) => ({ ...r, contratos: 0, valor: 0, gramos: 0 }));
  for (const c of contratos) {
    const v = c.contratoValor || 0;
    const b = buckets.find((x) => v >= x.desde && v <= x.hasta) || buckets[buckets.length - 1];
    b.contratos++;
    b.valor += v;
    b.gramos += c.contratoGramosEstimados || 0;
  }
  return { buckets, totalContratos, totalValor, totalGramos };
}

export function computeAggregates(contratos) {
  const totalContratos = contratos.length;
  const valorTotal = contratos.reduce((s, c) => s + (c.contratoValor || 0), 0);
  const retroProm = totalContratos ? contratos.reduce((s, c) => s + (c.porcentajeRetroventa || 0), 0) / totalContratos : 0;
  const vencidos = contratos.filter((c) => { const d = daysUntil(c.fechaTerminacion); return d !== null && d < 0; }).length;
  const porVencer = contratos.filter((c) => { const d = daysUntil(c.fechaTerminacion); return d !== null && d >= 0 && d <= 30; }).length;

  const porEstadoMap = {};
  for (const c of contratos) {
    const key = c.contratoEstado || '(sin estado)';
    if (!porEstadoMap[key]) porEstadoMap[key] = { estado: key, count: 0, valor: 0 };
    porEstadoMap[key].count++;
    porEstadoMap[key].valor += c.contratoValor || 0;
  }
  const porEstado = Object.values(porEstadoMap).sort((a, b) => b.valor - a.valor);

  const porCategoriaMap = {};
  for (const c of contratos) {
    const key = c.contratoCategoria || '(sin categoría)';
    if (!porCategoriaMap[key]) porCategoriaMap[key] = { categoria: key, count: 0, valor: 0, gramos: 0 };
    porCategoriaMap[key].count++;
    porCategoriaMap[key].valor += c.contratoValor || 0;
    porCategoriaMap[key].gramos += c.contratoGramosEstimados || 0;
  }
  const porCategoria = Object.values(porCategoriaMap).sort((a, b) => b.valor - a.valor);

  const porSociedadMap = {};
  const porSucursalMap = {};
  for (const c of contratos) {
    const sociedad = sociedadReal(c) || '(sin sociedad)';
    if (!porSociedadMap[sociedad]) porSociedadMap[sociedad] = { sociedad, contratos: 0, valorTotal: 0, gramosOro: 0, valorOro: 0 };
    const gs = porSociedadMap[sociedad];
    gs.contratos++;
    gs.valorTotal += c.contratoValor || 0;
    if (c.contratoCategoria === 'ORO') { gs.gramosOro += c.contratoGramosEstimados || 0; gs.valorOro += c.contratoValor || 0; }

    const joyeria = c.joyeria || '(sin joyería)';
    if (!porSucursalMap[joyeria]) porSucursalMap[joyeria] = { joyeria, sociedad, ciudad: c.ciudad, contratos: 0, valorTotal: 0, gramosOro: 0, valorOro: 0 };
    const gj = porSucursalMap[joyeria];
    gj.contratos++;
    gj.valorTotal += c.contratoValor || 0;
    if (c.contratoCategoria === 'ORO') { gj.gramosOro += c.contratoGramosEstimados || 0; gj.valorOro += c.contratoValor || 0; }
  }
  const porSociedad = Object.values(porSociedadMap).sort((a, b) => b.valorTotal - a.valorTotal);
  const porSucursal = Object.values(porSucursalMap).sort((a, b) => b.valorTotal - a.valorTotal);

  const vencimientosPorPlazoMap = {};
  for (const c of contratos) {
    const termino = c.contratoTermino;
    const key = tipoPlazo(termino);
    if (!vencimientosPorPlazoMap[key]) vencimientosPorPlazoMap[key] = { label: key, termino, total: 0, vencidos: 0, porVencer: 0, alDia: 0 };
    const g = vencimientosPorPlazoMap[key];
    g.total++;
    const d = daysUntil(c.fechaTerminacion);
    if (d !== null && d < 0) g.vencidos++;
    else if (d !== null && d <= 30) g.porVencer++;
    else g.alDia++;
  }
  const vencimientosPorPlazo = Object.values(vencimientosPorPlazoMap).sort((a, b) => ordenPlazo(a.termino) - ordenPlazo(b.termino));

  const porRangoValorTodas = rangoValorDe(contratos);
  const porRangoValorOro = rangoValorDe(contratos.filter((c) => c.contratoCategoria === 'ORO'));

  return {
    kpis: { totalContratos, valorTotal, retroProm, vencidos, porVencer },
    porEstado,
    porCategoria,
    porSociedad,
    porSucursal,
    vencimientosPorPlazo,
    porRangoValorTodas,
    porRangoValorOro,
  };
}

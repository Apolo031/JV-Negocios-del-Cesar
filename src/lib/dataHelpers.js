// Lógica compartida entre todas las vistas del panel. Se mantiene igual a la
// versión HTML original para que el comportamiento no cambie al migrar.

export const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
export const MONTH_NAMES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export const BRANCHES = ['Barranquilla','Caucasia','Euro','Heroica','Sinú','La 5'];
export const BRANCH_COLOR = {
  Barranquilla: '#e8cd7a', Caucasia: '#5b8dbe', Euro: '#7fa37a', Heroica: '#c1443a', Sinú: '#9b7ebd', 'La 5': '#4fb3a9',
};
export const METRIC_LABEL = {
  gr_contrato: 'Gramos en contrato', valor_contratado: 'Valor contratado', utilidad: 'Utilidad',
  prorroga: 'Prórrogas', venta_oro: 'Venta de oro (g)', valor_venta_oro: 'Venta de oro ($)',
  venta_plata: 'Venta de plata (g)', valor_venta_plata: 'Venta de plata ($)',
  operacion_efecty: 'Recaudo Efecty', cantidad_efecty: 'Operaciones Efecty',
  operacion_sistecredito: 'Recaudo Sistecrédito', cantidad_sistecredito: 'Operaciones Sistecrédito',
};
function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }

/**
 * Convierte un texto tipo "SABADO 15 AGOSTO" en una fecha real, para poder
 * ordenar los reportes semanales cronológicamente. Antes se guardaban
 * (y ordenaban) como texto plano, así que "SABADO 8 AGOSTO" quedaba después
 * de "SABADO 15 AGOSTO" en orden alfabético — el 8 nunca era "el más
 * reciente" aunque cronológicamente sí lo fuera respecto a otras fechas.
 * Como el texto no trae año, se elige entre el año actual y el anterior el
 * que dé una fecha más cercana a "hoy" (sin pasarse más de ~45 días al
 * futuro), para no romperse en el cruce de diciembre a enero.
 */
export function parseFechaSemanal(fecha, referenceDate = new Date()) {
  if (!fecha) return null;
  const norm = stripAccents(String(fecha).toUpperCase());
  const match = norm.match(/(\d{1,2})\s+([A-Z]+)/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const monthNames = MONTH_NAMES_FULL.map((m) => stripAccents(m.toUpperCase()));
  const month = monthNames.indexOf(match[2]);
  if (month === -1) return null;

  const refYear = referenceDate.getFullYear();
  let candidate = new Date(refYear, month, day);
  const FORTY_FIVE_DAYS = 45 * 24 * 60 * 60 * 1000;
  if (candidate.getTime() - referenceDate.getTime() > FORTY_FIVE_DAYS) {
    candidate = new Date(refYear - 1, month, day);
  }
  return candidate;
}

/** Ordena reportes semanales ({fecha, ...}) de más antiguo a más reciente. */
export function sortWeekly(weekly) {
  return [...weekly].sort((a, b) => {
    const da = parseFechaSemanal(a.fecha);
    const db = parseFechaSemanal(b.fecha);
    if (da && db) return da - db;
    if (da) return -1;
    if (db) return 1;
    return (a.fecha || '').localeCompare(b.fecha || '');
  });
}

export const EMPTY_MONTH_ARRAY = () => new Array(12).fill(0);
export const EDIT_METRICS = ['gr_contrato','valor_contratado','utilidad','prorroga','venta_oro','valor_venta_oro','venta_plata','valor_venta_plata','operacion_efecty','operacion_sistecredito'];

export function fmtMoney(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
}
export function fmtMoneyShort(v) {
  if (!v) return '$0';
  const abs = Math.abs(v);
  if (abs >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}
export function fmtGr(v) {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' g';
}
export function fmtNum(v) {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('es-CO', { maximumFractionDigits: 1 });
}
export function fmtPct(v) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const s = v >= 0 ? '+' : '';
  return s + v.toFixed(1) + '%';
}
export function isMoney(metric) {
  return !!metric && (metric.startsWith('valor_') || metric === 'utilidad' || metric === 'prorroga' || metric.startsWith('operacion_'));
}
export function fmtByMetric(metric, v) {
  return isMoney(metric) ? fmtMoney(v) : fmtNum(v);
}

/** Construye un esqueleto vacío { [branch]: { '2025': {...}, '2026': {...} } } */
export function emptyMonthlyData() {
  const out = {};
  BRANCHES.forEach((b) => {
    out[b] = { 2025: {}, 2026: {} };
    ['2025', '2026'].forEach((y) => {
      EDIT_METRICS.concat(['cantidad_efecty', 'cantidad_sistecredito']).forEach((m) => {
        out[b][y][m] = EMPTY_MONTH_ARRAY();
      });
    });
  });
  return out;
}

export function series(monthly, branch, year, metric) {
  return (monthly[branch] && monthly[branch][year] && monthly[branch][year][metric]) || EMPTY_MONTH_ARRAY();
}
export function sumSeries(monthly, year, metric, upto) {
  const n = upto === undefined ? 12 : upto;
  const out = new Array(n).fill(0);
  BRANCHES.forEach((b) => {
    const s = series(monthly, b, year, metric);
    for (let i = 0; i < n; i++) out[i] += s[i] || 0;
  });
  return out;
}
export function totalFor(monthly, branch, year, metric, upto) {
  const n = upto === undefined ? 12 : upto;
  const s = series(monthly, branch, year, metric);
  let t = 0;
  for (let i = 0; i < n; i++) t += s[i] || 0;
  return t;
}
export function totalAll(monthly, year, metric, upto) {
  let t = 0;
  BRANCHES.forEach((b) => (t += totalFor(monthly, b, year, metric, upto)));
  return t;
}
export function lastActiveMonth2026(monthly) {
  let last = -1;
  for (let m = 0; m < 12; m++) {
    let act = 0;
    BRANCHES.forEach((b) => { act += series(monthly, b, '2026', 'valor_contratado')[m] || 0; });
    if (act > 0) last = m;
  }
  return last < 0 ? 0 : last;
}

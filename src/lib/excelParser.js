// Extrae los datos mensuales y semanales del archivo Excel de control interno.
// Reproduce exactamente la misma lÃ³gica que usamos para la carga inicial
// (hojas BARRANQUILLA / CAUCASIA / EURO / HEROICA / SINU con dos bloques de
// filas â€”2025 y 2026â€” y la hoja SEMANALES con reportes de avance).
// Solo se importa desde cÃ³digo de SERVIDOR (API routes), nunca desde el cliente.

import * as XLSX from 'xlsx';

const METRIC_ROWS_2025 = {
  gr_contrato: 5, valor_contratado: 6, utilidad: 7, prorroga: 8,
  venta_oro: 9, valor_venta_oro: 10, venta_plata: 11, valor_venta_plata: 12,
  operacion_efecty: 13, cantidad_efecty: 14, operacion_sistecredito: 15, cantidad_sistecredito: 16,
};
const METRIC_ROWS_2026 = Object.fromEntries(Object.entries(METRIC_ROWS_2025).map(([k, v]) => [k, v + 14]));

// Nombres de hoja normalizados (mayÃºsculas, sin espacios) -> nombre de sucursal.
const SHEET_BRANCH_MAP = {
  BARRANQUILLA: 'Barranquilla',
  CAUCASIA: 'Caucasia',
  EURO: 'Euro',
  HEROICA: 'Heroica',
  SINU: 'SinÃº',
  SINÃš: 'SinÃº',
};

/** Accede a una celda como openpyxl: cell(grid, fila, columna) con Ã­ndices 1-based. */
function cell(grid, r, c) {
  const row = grid[r - 1];
  if (!row) return null;
  const v = row[c - 1];
  return v === undefined ? null : v;
}

/** Limpia valores: corrige errores de digitaciÃ³n tipo "1.999.66" -> 1999.66. */
function clean(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'string') {
    let s = v.trim();
    const parts = s.split('.');
    if (parts.length > 2) s = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
    const n = parseFloat(s.replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return v;
}

function sheetToGrid(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

export function parseMonthly(workbook) {
  const monthly = {};
  for (const rawName of workbook.SheetNames) {
    const key = rawName.trim().toUpperCase();
    const branch = SHEET_BRANCH_MAP[key];
    if (!branch) continue;
    const grid = sheetToGrid(workbook, rawName);
    if (!grid) continue;

    monthly[branch] = { 2025: {}, 2026: {} };
    for (const [year, rows] of [['2025', METRIC_ROWS_2025], ['2026', METRIC_ROWS_2026]]) {
      for (const [metric, r] of Object.entries(rows)) {
        const vals = [];
        for (let i = 0; i < 12; i++) vals.push(clean(cell(grid, r, 3 + i))); // columnas C..N = 12 meses
        monthly[branch][year][metric] = vals;
      }
    }
  }
  return monthly;
}

const WEEK_BRANCH_COLS = { Barranquillera: 2, Caucasia: 5, Euro: 8, Heroica: 11, SinÃº: 14 };
const WEEK_METRICS_ORDER = [
  'gramos', 'valor_contratado', 'utilidad', 'prorroga', 'venta_oro', 'valor_venta_oro',
  'venta_plata', 'valor_venta_plata', 'efecty', 'cant_efecty', 'sistecredito', 'cant_sistecredito',
];

export function parseWeekly(workbook) {
  const sheetName = workbook.SheetNames.find((n) => n.trim().toUpperCase() === 'SEMANALES');
  if (!sheetName) return [];
  const grid = sheetToGrid(workbook, sheetName);
  if (!grid) return [];

  const weeks = [];
  let row = 2;
  const maxRow = grid.length;
  while (row <= maxRow) {
    const marker = cell(grid, row, 2);
    if (marker && String(marker).toUpperCase().includes('REPORTES')) {
      const fecha = cell(grid, row, 14) || `semana-fila-${row}`;
      const week = { fecha: String(fecha), sucursales: {} };
      for (const [branch, col] of Object.entries(WEEK_BRANCH_COLS)) {
        const vals = {};
        for (let i = 0; i < WEEK_METRICS_ORDER.length; i++) {
          vals[WEEK_METRICS_ORDER[i]] = clean(cell(grid, row + 2 + i, col + 1));
        }
        week.sucursales[branch] = vals;
      }
      weeks.push(week);
      row += 18;
    } else {
      row += 1;
    }
  }
  return weeks;
}

export function slugifyFecha(fecha) {
  return String(fecha).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function parseWorkbookBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const monthly = parseMonthly(workbook);
  const weekly = parseWeekly(workbook);
  return { monthly, weekly };
}
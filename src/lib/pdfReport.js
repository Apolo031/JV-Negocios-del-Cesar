// Genera el PDF de "Resumen general" — un reporte de una sola pasada con
// todos los indicadores clave, comparados sucursal por sucursal, para poder
// evaluarlos e imprimirlos/enviarlos sin tener que entrar al panel.
// Solo se usa desde el cliente (botón "Descargar PDF"), nunca desde el servidor.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BRANCHES, MONTH_NAMES_FULL, METRIC_LABEL,
  fmtMoney, fmtGr, fmtPct,
  totalFor, totalAll, lastActiveMonth2026,
} from './dataHelpers';

const REPORT_METRICS = [
  'valor_contratado', 'utilidad', 'gr_contrato', 'valor_venta_oro',
  'valor_venta_plata', 'prorroga', 'operacion_efecty', 'operacion_sistecredito',
];

const GOLD = [199, 163, 57];
const DARK = [26, 32, 41];

function fmtCell(metric, v) {
  return metric === 'gr_contrato' ? fmtGr(v) : fmtMoney(v);
}

function sectionHeader(doc, text, y) {
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.setFont(undefined, 'bold');
  doc.text(text, 14, y);
  doc.setFont(undefined, 'normal');
  return y + 6;
}

function ensureSpace(doc, y, needed) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 12) {
    doc.addPage();
    return 18;
  }
  return y;
}

export function generateGeneralReportPdf({ monthly, weekly }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const lastM = lastActiveMonth2026(monthly);
  const uptoFull = lastM + 1;
  const cutoffYoY = Math.min(lastM + 1, 6); // mismo periodo comparable ambos años

  // --- Encabezado ---
  doc.setFontSize(18);
  doc.setTextColor(...DARK);
  doc.setFont(undefined, 'bold');
  doc.text('Joyerías del Cesar — Resumen general', 14, 16);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Generado el ${new Date().toLocaleString('es-CO')} · Año en curso 2026, Ene–${MONTH_NAMES_FULL[lastM]}`,
    14, 22
  );

  // --- KPIs consolidados ---
  const totalContratado = totalAll(monthly, '2026', 'valor_contratado', uptoFull);
  const totalUtilidad = totalAll(monthly, '2026', 'utilidad', uptoFull);
  const totalGramos = totalAll(monthly, '2026', 'gr_contrato', uptoFull);
  const margenGlobal = totalContratado ? (totalUtilidad / totalContratado) * 100 : 0;

  autoTable(doc, {
    startY: 28,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    body: [[
      `Valor contratado: ${fmtMoney(totalContratado)}`,
      `Utilidad: ${fmtMoney(totalUtilidad)}`,
      `Margen: ${margenGlobal.toFixed(1)}%`,
      `Gramos en contrato: ${fmtGr(totalGramos)}`,
    ]],
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' }, 3: { fontStyle: 'bold' } },
  });

  let y = doc.lastAutoTable.finalY + 8;

  // --- Tabla comparativa: cada indicador (fila) por cada sucursal (columna) ---
  y = sectionHeader(doc, `Indicadores por sucursal (2026, Ene–${MONTH_NAMES_FULL[lastM]})`, y);
  const matrixBody = REPORT_METRICS.map((metric) => [
    METRIC_LABEL[metric],
    ...BRANCHES.map((b) => fmtCell(metric, totalFor(monthly, b, '2026', metric, uptoFull))),
    fmtCell(metric, totalAll(monthly, '2026', metric, uptoFull)),
  ]);
  matrixBody.push([
    'Margen (%)',
    ...BRANCHES.map((b) => {
      const vc = totalFor(monthly, b, '2026', 'valor_contratado', uptoFull);
      const ut = totalFor(monthly, b, '2026', 'utilidad', uptoFull);
      return vc ? (ut / vc * 100).toFixed(1) + '%' : '—';
    }),
    margenGlobal.toFixed(1) + '%',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Indicador', ...BRANCHES, 'Total']],
    body: matrixBody,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: GOLD, textColor: 30, fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === data.table.columns.length - 1) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  // --- Variación año contra año (mismo periodo) ---
  y = ensureSpace(doc, y, 60);
  y = sectionHeader(doc, `Variación Ene–${MONTH_NAMES_FULL[cutoffYoY - 1]} 2025 vs. 2026`, y);
  const yoyBody = BRANCHES.map((b) => {
    const ut25 = totalFor(monthly, b, '2025', 'utilidad', cutoffYoY);
    const ut26 = totalFor(monthly, b, '2026', 'utilidad', cutoffYoY);
    const vc25 = totalFor(monthly, b, '2025', 'valor_contratado', cutoffYoY);
    const vc26 = totalFor(monthly, b, '2026', 'valor_contratado', cutoffYoY);
    const utVar = ut25 ? fmtPct(((ut26 - ut25) / Math.abs(ut25)) * 100) : (ut26 ? 'Nueva' : '—');
    const vcVar = vc25 ? fmtPct(((vc26 - vc25) / Math.abs(vc25)) * 100) : (vc26 ? 'Nueva' : '—');
    return [b, fmtMoney(ut25), fmtMoney(ut26), utVar, fmtMoney(vc25), fmtMoney(vc26), vcVar];
  });
  autoTable(doc, {
    startY: y,
    head: [['Sucursal', 'Utilidad 2025', 'Utilidad 2026', 'Var. utilidad', 'Contratado 2025', 'Contratado 2026', 'Var. contratado']],
    body: yoyBody,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold' } },
  });
  y = doc.lastAutoTable.finalY + 8;

  // --- Ranking de utilidad ---
  y = ensureSpace(doc, y, 55);
  y = sectionHeader(doc, 'Ranking de utilidad (2026 YTD)', y);
  const rank = BRANCHES.map((b) => ({ b, v: totalFor(monthly, b, '2026', 'utilidad', uptoFull) })).sort((a, c) => c.v - a.v);
  const rankTotal = rank.reduce((s, r) => s + r.v, 0);
  autoTable(doc, {
    startY: y,
    head: [['#', 'Sucursal', 'Utilidad', '% del total']],
    body: rank.map((r, i) => [i + 1, r.b, fmtMoney(r.v), rankTotal ? ((r.v / rankTotal) * 100).toFixed(1) + '%' : '—']),
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: GOLD, textColor: 30, fontStyle: 'bold' },
    tableWidth: 120,
  });
  y = doc.lastAutoTable.finalY + 8;

  // --- Último reporte semanal comparado ---
  if (weekly && weekly.length > 0) {
    y = ensureSpace(doc, y, 60);
    const w0 = weekly[weekly.length - 2] || weekly[0];
    const w1 = weekly[weekly.length - 1];
    y = sectionHeader(doc, 'Seguimiento semanal — utilidad', y);
    const weekBranchKey = { Barranquilla: 'Barranquillera', Caucasia: 'Caucasia', Euro: 'Euro', Heroica: 'Heroica', Sinú: 'Sinú', 'La 5': 'La 5' };
    const weekBody = BRANCHES.map((b) => {
      const k = weekBranchKey[b];
      const v1 = w0.sucursales?.[k]?.utilidad || 0;
      const v2 = w1 ? (w1.sucursales?.[k]?.utilidad || 0) : null;
      const varTxt = v2 === null ? '—' : (!v1 && v2 ? 'Repuntó' : (!v1 && !v2 ? 'Sin actividad' : fmtPct(((v2 - v1) / Math.abs(v1)) * 100)));
      return [b, fmtMoney(v1), v2 !== null ? fmtMoney(v2) : '—', varTxt];
    });
    autoTable(doc, {
      startY: y,
      head: [['Sucursal', w0.fecha || '—', w1 ? w1.fecha : '—', 'Variación']],
      body: weekBody,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold' },
      tableWidth: 140,
    });
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 6);
  }

  const fecha = new Date().toISOString().slice(0, 10);
  doc.save(`resumen-general-joyerias-${fecha}.pdf`);
}

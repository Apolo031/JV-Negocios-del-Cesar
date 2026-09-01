// Genera el PDF de "Resumen general" — un reporte de una sola pasada con
// todos los indicadores clave, comparados sucursal por sucursal, para poder
// evaluarlos e imprimirlos/enviarlos sin tener que entrar al panel.
// Solo se usa desde el cliente (botón "Descargar PDF"), nunca desde el servidor.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Chart from 'chart.js/auto';
import {
  BRANCHES, BRANCH_COLOR, ALL_METRICS, MONTH_NAMES_FULL, METRIC_LABEL,
  fmtMoney, fmtMoneyShort, fmtGr, fmtPct, fmtConcepto,
  totalFor, totalAll, lastActiveMonth2026, parseFechaSemanal,
} from './dataHelpers';

const WEEK_BRANCH_KEY = { Barranquilla: 'Barranquillera', Caucasia: 'Caucasia', Euro: 'Euro', Heroica: 'Heroica', Sinú: 'Sinú', 'La 5': 'La 5' };

const GOLD = [199, 163, 57];
const DARK = [26, 32, 41];

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

/** Dibuja un gráfico de barras fuera de pantalla y lo devuelve como PNG (data URL). */
async function barChartImage({ labels, data, colors, title }) {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 420;
  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 6 }] },
    options: {
      responsive: false,
      animation: false,
      devicePixelRatio: 2,
      plugins: {
        legend: { display: false },
        title: { display: !!title, text: title, color: '#1a2029', font: { size: 20, weight: 'bold' } },
      },
      scales: {
        x: { ticks: { color: '#1a2029', font: { size: 16 } }, grid: { display: false } },
        y: { ticks: { color: '#4a5060', font: { size: 14 }, callback: (v) => fmtMoneyShort(v) }, grid: { color: '#e5e5e5' } },
      },
    },
  });
  await new Promise((r) => requestAnimationFrame(r));
  const img = chart.toBase64Image('image/png', 1);
  chart.destroy();
  return img;
}

/**
 * @param {object} params
 * @param {object} params.monthly
 * @param {Array} params.weekly
 * @param {number} [params.cutoffMonth] Índice de mes (0=Ene..11=Dic) hasta el que se acumula el
 *   reporte 2026. Si no se pasa, usa el último mes con datos.
 */
export async function generateGeneralReportPdf({ monthly, weekly, cutoffMonth }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const lastM = lastActiveMonth2026(monthly);
  const monthIdx = cutoffMonth === undefined || cutoffMonth === null ? lastM : cutoffMonth;
  const uptoFull = monthIdx + 1;
  const monthLabel = MONTH_NAMES_FULL[monthIdx];

  // --- Encabezado ---
  doc.setFontSize(18);
  doc.setTextColor(...DARK);
  doc.setFont(undefined, 'bold');
  doc.text('Joyerías del Cesar — Resumen general', 14, 16);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Generado el ${new Date().toLocaleString('es-CO')} · Año en curso 2026, Ene–${monthLabel}`,
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
  let y = doc.lastAutoTable.finalY + 6;

  // --- Gráficos de barras: utilidad y valor contratado por sucursal ---
  const chartColors = BRANCHES.map((b) => BRANCH_COLOR[b]);
  const [utilidadImg, contratadoImg] = await Promise.all([
    barChartImage({
      labels: BRANCHES,
      data: BRANCHES.map((b) => totalFor(monthly, b, '2026', 'utilidad', uptoFull)),
      colors: chartColors,
      title: `Utilidad por sucursal (Ene–${monthLabel})`,
    }),
    barChartImage({
      labels: BRANCHES,
      data: BRANCHES.map((b) => totalFor(monthly, b, '2026', 'valor_contratado', uptoFull)),
      colors: chartColors,
      title: `Valor contratado por sucursal (Ene–${monthLabel})`,
    }),
  ]);
  const chartW = 130, chartH = (chartW * 420) / 900;
  doc.addImage(utilidadImg, 'PNG', 14, y, chartW, chartH);
  doc.addImage(contratadoImg, 'PNG', 14 + chartW + 9, y, chartW, chartH);
  y += chartH + 8;

  // --- Tabla comparativa: cada indicador (fila) por cada sucursal (columna) ---
  y = ensureSpace(doc, y, 90);
  y = sectionHeader(doc, `Indicadores por sucursal (2026, Ene–${monthLabel})`, y);
  const matrixBody = ALL_METRICS.map((metric) => [
    METRIC_LABEL[metric],
    ...BRANCHES.map((b) => fmtConcepto(metric, totalFor(monthly, b, '2026', metric, uptoFull))),
    fmtConcepto(metric, totalAll(monthly, '2026', metric, uptoFull)),
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

  // --- Variación año contra año (mismo periodo, Ene–mes elegido) ---
  y = ensureSpace(doc, y, 60);
  y = sectionHeader(doc, `Variación Ene–${monthLabel} 2025 vs. 2026`, y);
  const yoyBody = BRANCHES.map((b) => {
    const ut25 = totalFor(monthly, b, '2025', 'utilidad', uptoFull);
    const ut26 = totalFor(monthly, b, '2026', 'utilidad', uptoFull);
    const vc25 = totalFor(monthly, b, '2025', 'valor_contratado', uptoFull);
    const vc26 = totalFor(monthly, b, '2026', 'valor_contratado', uptoFull);
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
  y = sectionHeader(doc, `Ranking de utilidad (Ene–${monthLabel} 2026)`, y);
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

  // --- Reportes semanales del mes elegido ---
  const weeksInMonth = (weekly || []).filter((w) => {
    const d = parseFechaSemanal(w.fecha);
    return d && d.getMonth() === monthIdx;
  });
  if (weeksInMonth.length > 0) {
    y = ensureSpace(doc, y, 60);
    const w0 = weeksInMonth[0];
    const w1 = weeksInMonth.length > 1 ? weeksInMonth[weeksInMonth.length - 1] : null;
    y = sectionHeader(doc, `Seguimiento semanal — utilidad (${monthLabel})`, y);
    const weekBody = BRANCHES.map((b) => {
      const k = WEEK_BRANCH_KEY[b];
      const v1 = w0.sucursales?.[k]?.utilidad || 0;
      const v2 = w1 ? (w1.sucursales?.[k]?.utilidad || 0) : null;
      const varTxt = v2 === null ? '—' : (!v1 && v2 ? 'Repuntó' : (!v1 && !v2 ? 'Sin actividad' : fmtPct(((v2 - v1) / Math.abs(v1)) * 100)));
      return [b, fmtMoney(v1), v2 !== null ? fmtMoney(v2) : '—', varTxt];
    });
    autoTable(doc, {
      startY: y,
      head: [['Sucursal', w0.fecha || '—', w1 ? w1.fecha : '(única semana del mes)', 'Variación']],
      body: weekBody,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold' },
      tableWidth: 140,
    });
  } else {
    y = ensureSpace(doc, y, 16);
    doc.setFontSize(9.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`No hay reportes semanales cargados para ${monthLabel}.`, 14, y + 4);
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 6);
  }

  const fecha = new Date().toISOString().slice(0, 10);
  doc.save(`resumen-general-joyerias-${monthLabel.toLowerCase()}-${fecha}.pdf`);
}

// Genera el PDF del informe de contratos (indicadores agregados) — pensado
// para que el accionista lo pueda ver/imprimir sin entrar al panel.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Chart from 'chart.js/auto';
import { fmtMoney, fmtMoneyShort, fmtGr, fmtPct } from './dataHelpers';

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

async function barChartImage({ labels, data, colors, title, money = true }) {
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
        x: { ticks: { color: '#1a2029', font: { size: 13 } }, grid: { display: false } },
        y: { ticks: { color: '#4a5060', font: { size: 14 }, callback: (v) => (money ? fmtMoneyShort(v) : v) }, grid: { color: '#e5e5e5' } },
      },
    },
  });
  await new Promise((r) => requestAnimationFrame(r));
  const img = chart.toBase64Image('image/png', 1);
  chart.destroy();
  return img;
}

/** @param {object} aggregates Resultado de computeAggregates(). @param {object} meta {archivo, generadoEn} */
export async function generateContratosReportPdf(aggregates, meta = {}) {
  const { kpis, porEstado, porCategoria, porSociedad, porSucursal, vencimientosPorPlazo, porRangoValorTodas } = aggregates;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // --- Encabezado ---
  doc.setFontSize(18);
  doc.setTextColor(...DARK);
  doc.setFont(undefined, 'bold');
  doc.text('Joyerías del Cesar — Informe de contratos', 14, 16);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  const fechaGen = meta.generadoEn ? new Date(meta.generadoEn).toLocaleString('es-CO') : new Date().toLocaleString('es-CO');
  doc.text(`Generado el ${fechaGen}${meta.archivo ? ' · Fuente: ' + meta.archivo : ''}`, 14, 22);

  // --- KPIs ---
  autoTable(doc, {
    startY: 28,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    body: [[
      `Contratos: ${kpis.totalContratos.toLocaleString('es-CO')}`,
      `Valor contratado: ${fmtMoney(kpis.valorTotal)}`,
      `% retroventa prom.: ${kpis.retroProm.toFixed(1)}%`,
      `Vencidos: ${kpis.vencidos.toLocaleString('es-CO')}`,
      `Por vencer (30d): ${kpis.porVencer.toLocaleString('es-CO')}`,
    ]],
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' }, 3: { fontStyle: 'bold' }, 4: { fontStyle: 'bold' } },
  });
  let y = doc.lastAutoTable.finalY + 6;

  // --- Gráficos: top sociedades por valor, estado de la cartera ---
  const topSociedades = porSociedad.slice(0, 8);
  const [sociedadImg, estadoImg] = await Promise.all([
    barChartImage({
      labels: topSociedades.map((s) => s.sociedad),
      data: topSociedades.map((s) => s.valorTotal),
      colors: topSociedades.map(() => GOLD),
      title: 'Valor por sociedad (top 8)',
    }),
    barChartImage({
      labels: porEstado.map((e) => e.estado),
      data: porEstado.map((e) => e.count),
      colors: porEstado.map(() => DARK),
      title: 'Contratos por estado',
      money: false,
    }),
  ]);
  const chartW = 130, chartH = (chartW * 420) / 900;
  doc.addImage(sociedadImg, 'PNG', 14, y, chartW, chartH);
  doc.addImage(estadoImg, 'PNG', 14 + chartW + 9, y, chartW, chartH);
  y += chartH + 8;

  // --- Vencidos y por vencer por tipo de plazo ---
  y = ensureSpace(doc, y, 55);
  y = sectionHeader(doc, 'Vencidos y por vencer por tipo de plazo', y);
  autoTable(doc, {
    startY: y,
    head: [['Tipo de plazo', 'Total', 'Al día', 'Por vencer (30d)', 'Vencidos']],
    body: vencimientosPorPlazo.map((g) => [g.label, g.total, g.alDia, g.porVencer, g.vencidos]),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold' },
    tableWidth: 140,
  });
  y = doc.lastAutoTable.finalY + 8;

  // --- Contratos por rango de valor ---
  y = ensureSpace(doc, y, 60);
  y = sectionHeader(doc, 'Contratos por rango de valor', y);
  autoTable(doc, {
    startY: y,
    head: [['Rango', 'Contratos', '% contratos', 'Valor', '% valor']],
    body: porRangoValorTodas.buckets.map((b) => [
      b.label, b.contratos,
      porRangoValorTodas.totalContratos ? ((b.contratos / porRangoValorTodas.totalContratos) * 100).toFixed(1) + '%' : '—',
      fmtMoney(b.valor),
      porRangoValorTodas.totalValor ? ((b.valor / porRangoValorTodas.totalValor) * 100).toFixed(1) + '%' : '—',
    ]),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: GOLD, textColor: 30, fontStyle: 'bold' },
    tableWidth: 150,
  });
  y = doc.lastAutoTable.finalY + 8;

  // --- Resumen por sociedad ---
  y = ensureSpace(doc, y, 70);
  y = sectionHeader(doc, 'Resumen por sociedad', y);
  autoTable(doc, {
    startY: y,
    head: [['Sociedad', 'Contratos', 'Valor total', 'Gramos oro', 'Valor oro', '$/gramo']],
    body: porSociedad.map((s) => [
      s.sociedad, s.contratos, fmtMoney(s.valorTotal), fmtGr(s.gramosOro), fmtMoney(s.valorOro),
      s.gramosOro ? fmtMoney(s.valorOro / s.gramosOro) : '—',
    ]),
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: GOLD, textColor: 30, fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold' } },
  });
  y = doc.lastAutoTable.finalY + 8;

  // --- Resumen por categoría ---
  y = ensureSpace(doc, y, 40);
  y = sectionHeader(doc, 'Resumen por categoría', y);
  autoTable(doc, {
    startY: y,
    head: [['Categoría', 'Contratos', 'Valor', 'Gramos']],
    body: porCategoria.map((c) => [c.categoria, c.count, fmtMoney(c.valor), fmtGr(c.gramos)]),
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold' },
    tableWidth: 110,
  });
  y = doc.lastAutoTable.finalY + 8;

  // --- Top 20 sucursales por valor ---
  y = ensureSpace(doc, y, 90);
  y = sectionHeader(doc, 'Top 20 sucursales por valor', y);
  const topSucursales = porSucursal.slice(0, 20);
  autoTable(doc, {
    startY: y,
    head: [['Sucursal', 'Sociedad', 'Ciudad', 'Contratos', 'Valor total', 'Valor oro', '$/gramo']],
    body: topSucursales.map((j) => [
      j.joyeria, j.sociedad, j.ciudad, j.contratos, fmtMoney(j.valorTotal), fmtMoney(j.valorOro),
      j.gramosOro ? fmtMoney(j.valorOro / j.gramosOro) : '—',
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: GOLD, textColor: 30, fontStyle: 'bold' },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 6);
  }

  const fecha = new Date().toISOString().slice(0, 10);
  doc.save(`informe-contratos-${fecha}.pdf`);
}

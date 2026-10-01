'use client';

import { useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import ChartCanvas from '@/components/charts/ChartCanvas';
import {
  BRANCHES, BRANCH_COLOR, ALL_METRICS, METRIC_LABEL, MONTH_NAMES, MONTH_NAMES_FULL,
  fmtMoney, fmtMoneyShort, fmtGr, fmtPct, fmtConcepto,
  sumSeries, series, totalFor, totalAll, lastActiveMonth2026,
} from '@/lib/dataHelpers';

export default function ResumenPage() {
  const { monthly, weekly, loading } = useData();
  const [period, setPeriod] = useState('ytd'); // 'ytd' | 'mes' | '2025'
  const [mesIndividual, setMesIndividual] = useState(null); // null = usa el último mes con datos
  const [trendMetric, setTrendMetric] = useState('utilidad');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfMonth, setPdfMonth] = useState(null); // null = usa el último mes con datos

  const lastM = useMemo(() => lastActiveMonth2026(monthly), [monthly]);
  const pdfMonthValue = pdfMonth === null ? lastM : pdfMonth;
  const mesSel = mesIndividual === null ? lastM : mesIndividual;
  const isMes = period === 'mes';
  const year = period === '2025' ? '2025' : '2026';
  const upto = period === '2025' ? 12 : lastM + 1;

  // Valor de un concepto para una sucursal en el periodo elegido: si es "Un
  // mes" se toma solo ese mes puntual (no acumulado); si no, se acumula
  // Ene-hasta `upto`. Recibe el año explícito para poder comparar contra el
  // mismo periodo de 2025.
  function valFor(y, branch, metric) {
    return isMes ? (series(monthly, branch, y, metric)[mesSel] || 0) : totalFor(monthly, branch, y, metric, upto);
  }
  function valAllFor(y, metric) {
    return BRANCHES.reduce((s, b) => s + valFor(y, b, metric), 0);
  }

  async function handleDownloadPdf() {
    setGeneratingPdf(true);
    try {
      const { generateGeneralReportPdf } = await import('@/lib/pdfReport');
      await generateGeneralReportPdf({ monthly, weekly, cutoffMonth: pdfMonthValue });
    } finally {
      setGeneratingPdf(false);
    }
  }

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>;

  const totalContratado = valAllFor(year, 'valor_contratado');
  const totalUtilidad = valAllFor(year, 'utilidad');
  const totalGramos = valAllFor(year, 'gr_contrato');
  const margen = totalContratado ? (totalUtilidad / totalContratado) * 100 : 0;

  let deltaContratado = null, deltaUtilidad = null;
  if (period !== '2025') {
    const prevContratado = valAllFor('2025', 'valor_contratado');
    const prevUtilidad = valAllFor('2025', 'utilidad');
    deltaContratado = prevContratado ? ((totalContratado - prevContratado) / Math.abs(prevContratado)) * 100 : null;
    deltaUtilidad = prevUtilidad ? ((totalUtilidad - prevUtilidad) / Math.abs(prevUtilidad)) * 100 : null;
  }

  const rankUtilidad = BRANCHES.map((b) => ({ b, v: valFor(year, b, 'utilidad') })).sort((a, b) => b.v - a.v);
  const maxUtilidad = Math.max(1, ...rankUtilidad.map((r) => r.v));

  const rankGramos = BRANCHES.map((b) => ({ b, v: valFor(year, b, 'gr_contrato') })).sort((a, b) => b.v - a.v);
  const totalGramosRank = rankGramos.reduce((s, r) => s + r.v, 0);
  const maxGramos = Math.max(1, ...rankGramos.map((r) => r.v));

  const mixParts = [
    { k: 'Utilidad créditos', v: valAllFor(year, 'utilidad'), c: '#c7a339' },
    { k: 'Prórrogas', v: valAllFor(year, 'prorroga'), c: '#8a6a1f' },
    { k: 'Venta de oro', v: valAllFor(year, 'valor_venta_oro'), c: '#e8cd7a' },
    { k: 'Venta de plata', v: valAllFor(year, 'valor_venta_plata'), c: '#9b7ebd' },
  ].filter((p) => p.v > 0);

  const periodoLabel = period === '2025' ? '2025, año completo' : (isMes ? `${MONTH_NAMES_FULL[mesSel]} 2026` : `2026, Ene–${MONTH_NAMES[lastM]}`);

  const s25 = sumSeries(monthly, '2025', trendMetric);
  const s26 = sumSeries(monthly, '2026', trendMetric).map((v, i) => (i <= lastM ? v : null));

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Resumen general</h1>
          <p>Consolidado de las joyerías</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="btn-group">
            <button className={`btn-toggle${period === 'ytd' ? ' active' : ''}`} onClick={() => setPeriod('ytd')}>
              Año en curso (Ene–{MONTH_NAMES[lastM]})
            </button>
            <button className={`btn-toggle${isMes ? ' active' : ''}`} onClick={() => setPeriod('mes')}>
              Un mes
            </button>
            <button className={`btn-toggle${period === '2025' ? ' active' : ''}`} onClick={() => setPeriod('2025')}>
              Todo 2025
            </button>
          </div>
          {isMes && (
            <select value={mesSel} onChange={(e) => setMesIndividual(parseInt(e.target.value, 10))} title="Mes a mostrar">
              {MONTH_NAMES_FULL.slice(0, lastM + 1).map((m, i) => (
                <option key={m} value={i}>{m} 2026</option>
              ))}
            </select>
          )}
          <select value={pdfMonthValue} onChange={(e) => setPdfMonth(parseInt(e.target.value, 10))} title="Mes de corte del PDF">
            {MONTH_NAMES_FULL.slice(0, lastM + 1).map((m, i) => (
              <option key={m} value={i}>Hasta {m}</option>
            ))}
          </select>
          <button className="btn-outline" type="button" onClick={handleDownloadPdf} disabled={generatingPdf || loading}>
            {generatingPdf ? 'Generando…' : '⭳ Descargar PDF'}
          </button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Valor contratado</div>
          <div className="value">{fmtMoney(totalContratado)}</div>
          {deltaContratado !== null && (
            <div className={`delta ${deltaContratado >= 0 ? 'up' : 'down'}`}>
              {deltaContratado >= 0 ? '▲' : '▼'} {fmtPct(deltaContratado)} vs. mismo periodo 2025
            </div>
          )}
        </div>
        <div className="kpi">
          <div className="label">Utilidad total</div>
          <div className="value">{fmtMoney(totalUtilidad)}</div>
          {deltaUtilidad !== null && (
            <div className={`delta ${deltaUtilidad >= 0 ? 'up' : 'down'}`}>
              {deltaUtilidad >= 0 ? '▲' : '▼'} {fmtPct(deltaUtilidad)} vs. mismo periodo 2025
            </div>
          )}
        </div>
        <div className="kpi">
          <div className="label">Margen sobre lo contratado</div>
          <div className="value">{margen.toFixed(1)}%</div>
        </div>
        <div className="kpi">
          <div className="label">Gramos en contrato (oro)</div>
          <div className="value">{fmtGr(totalGramos)}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Resultados por sucursal — todos los conceptos</h3>
          <span className="hint">{periodoLabel}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Concepto</th>
                {BRANCHES.map((b) => <th key={b}>{b}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {ALL_METRICS.map((metric) => (
                <tr key={metric}>
                  <td className="name">{METRIC_LABEL[metric]}</td>
                  {BRANCHES.map((b) => <td key={b}>{fmtConcepto(metric, valFor(year, b, metric))}</td>)}
                  <td style={{ fontWeight: 700 }}>{fmtConcepto(metric, valAllFor(year, metric))}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td className="name">Margen (%)</td>
                {BRANCHES.map((b) => {
                  const vc = valFor(year, b, 'valor_contratado');
                  const ut = valFor(year, b, 'utilidad');
                  return <td key={b}>{vc ? (ut / vc * 100).toFixed(1) + '%' : '—'}</td>;
                })}
                <td>{margen.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>Ranking de utilidad por sucursal</h3>
            <span className="hint">{periodoLabel}</span>
          </div>
          {rankUtilidad.map((r, idx) => (
            <div className="ingot-row" key={r.b}>
              <div className="ingot-rank">{idx + 1}</div>
              <div className="ingot-name">{r.b}</div>
              <div className="ingot-track"><div className="ingot-fill" style={{ width: `${Math.max(3, (r.v / maxUtilidad) * 100)}%` }} /></div>
              <div className="ingot-value">{fmtMoneyShort(r.v)}</div>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Mezcla del negocio</h3>
            <span className="hint">{periodoLabel}</span>
          </div>
          <ChartCanvas
            height={230}
            config={{
              type: 'doughnut',
              data: { labels: mixParts.map((p) => p.k), datasets: [{ data: mixParts.map((p) => p.v), backgroundColor: mixParts.map((p) => p.c), borderColor: '#1a2029', borderWidth: 2 }] },
              options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.label + ': ' + fmtMoney(c.raw) } } } },
            }}
          />
          <div className="legend-row">
            {mixParts.map((p) => (
              <div className="legend-item" key={p.k}><span className="sw" style={{ background: p.c }} />{p.k} · {fmtMoneyShort(p.v)}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Gramos en contrato por sucursal</h3>
          <span className="hint">{periodoLabel}</span>
        </div>
        {rankGramos.map((r, idx) => (
          <div className="ingot-row" key={r.b}>
            <div className="ingot-rank">{idx + 1}</div>
            <div className="ingot-name">{r.b}</div>
            <div className="ingot-track"><div className="ingot-fill" style={{ width: `${Math.max(3, (r.v / maxGramos) * 100)}%` }} /></div>
            <div className="ingot-value">{fmtGr(r.v)}{totalGramosRank ? ` · ${((r.v / totalGramosRank) * 100).toFixed(0)}%` : ''}</div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6, fontSize: 12, color: 'var(--text-dim)' }}>
          Total: <b style={{ color: 'var(--gold-light)', marginLeft: 5 }}>{fmtGr(totalGramosRank)}</b>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Tendencia mensual · 2025 vs 2026</h3>
          <select value={trendMetric} onChange={(e) => setTrendMetric(e.target.value)}>
            {ALL_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
          </select>
        </div>
        <ChartCanvas
          height={90}
          config={{
            type: 'line',
            data: {
              labels: MONTH_NAMES,
              datasets: [
                { label: '2025', data: s25, borderColor: '#5e6678', backgroundColor: 'transparent', borderDash: [4, 3], tension: 0.3, pointRadius: 2 },
                { label: '2026', data: s26, borderColor: '#c7a339', backgroundColor: 'rgba(199,163,57,0.12)', fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: '#e8cd7a' },
              ],
            },
            options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 12 } } } },
          }}
        />
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Consolidado mensual {year}{period !== '2025' ? ` (Ene–${MONTH_NAMES[lastM]})` : ' (año completo)'}</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr><th style={{ textAlign: 'left' }}>Mes</th><th>Valor contratado</th><th>Utilidad</th><th>Margen</th><th>Gramos</th><th>Venta oro ($)</th><th>Prórrogas</th></tr>
            </thead>
            <tbody>
              {Array.from({ length: upto }).map((_, m) => {
                const vc = sumSeries(monthly, year, 'valor_contratado')[m];
                const ut = sumSeries(monthly, year, 'utilidad')[m];
                const gr = sumSeries(monthly, year, 'gr_contrato')[m];
                const vo = sumSeries(monthly, year, 'valor_venta_oro')[m];
                const pr = sumSeries(monthly, year, 'prorroga')[m];
                const mg = vc ? (ut / vc) * 100 : 0;
                return (
                  <tr key={m}>
                    <td className="name">{MONTH_NAMES_FULL[m]}</td>
                    <td>{fmtMoney(vc)}</td><td>{fmtMoney(ut)}</td><td>{mg.toFixed(1)}%</td>
                    <td>{fmtGr(gr)}</td><td>{fmtMoney(vo)}</td><td>{fmtMoney(pr)}</td>
                  </tr>
                );
              })}
              {(() => {
                // Esta tabla siempre muestra el acumulado Ene-upto completo
                // (independiente de si arriba se eligió "Un mes"), así que su
                // fila de Total se calcula aparte con totalAll puro.
                const totalContratadoAcum = totalAll(monthly, year, 'valor_contratado', upto);
                const totalUtilidadAcum = totalAll(monthly, year, 'utilidad', upto);
                const totalGramosAcum = totalAll(monthly, year, 'gr_contrato', upto);
                const margenAcum = totalContratadoAcum ? (totalUtilidadAcum / totalContratadoAcum) * 100 : 0;
                return (
                  <tr style={{ fontWeight: 700 }}>
                    <td className="name">Total</td>
                    <td>{fmtMoney(totalContratadoAcum)}</td><td>{fmtMoney(totalUtilidadAcum)}</td><td>{margenAcum.toFixed(1)}%</td>
                    <td>{fmtGr(totalGramosAcum)}</td><td>{fmtMoney(totalAll(monthly, year, 'valor_venta_oro', upto))}</td>
                    <td>{fmtMoney(totalAll(monthly, year, 'prorroga', upto))}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

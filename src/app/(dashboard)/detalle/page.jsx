'use client';

import { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import ChartCanvas from '@/components/charts/ChartCanvas';
import {
  BRANCHES, BRANCH_COLOR, ALL_METRICS, METRIC_LABEL, MONTH_NAMES, MONTH_NAMES_FULL,
  fmtByMetric, fmtMoney, fmtMoneyShort, fmtGr, fmtPct, fmtConcepto, isMoney,
  series, totalFor, lastActiveMonth2026,
} from '@/lib/dataHelpers';

export default function DetallePage() {
  const { monthly, loading } = useData();
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [year, setYear] = useState('2026');
  const [metric, setMetric] = useState('utilidad');
  const lastM0 = lastActiveMonth2026(monthly);
  const [cmpA, setCmpA] = useState({ year: '2026', month: lastM0 });
  const [cmpB, setCmpB] = useState({ year: '2025', month: lastM0 });

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>;

  const lastM = lastM0;
  const cutoff = year === '2026' ? lastM + 1 : 12;

  const totUt = totalFor(monthly, branch, year, 'utilidad', cutoff);
  const totVc = totalFor(monthly, branch, year, 'valor_contratado', cutoff);
  const totGr = totalFor(monthly, branch, year, 'gr_contrato', cutoff);
  const margen = totVc ? (totUt / totVc) * 100 : 0;

  const raw = series(monthly, branch, year, metric);
  const chartData = raw.map((v, i) => (year === '2026' && i > lastM ? null : v));

  const chEfecty = totalFor(monthly, branch, year, 'operacion_efecty', cutoff);
  const chSiste = totalFor(monthly, branch, year, 'operacion_sistecredito', cutoff);
  const chOro = totalFor(monthly, branch, year, 'valor_venta_oro', cutoff);
  const chPlata = totalFor(monthly, branch, year, 'valor_venta_plata', cutoff);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Detalle por sucursal</h1>
          <p>Composición mensual completa de una joyería</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={branch} onChange={(e) => setBranch(e.target.value)}>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select>
          <select value={year} onChange={(e) => setYear(e.target.value)}><option value="2026">2026</option><option value="2025">2025</option></select>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><div className="label">Valor contratado</div><div className="value">{fmtMoney(totVc)}</div></div>
        <div className="kpi"><div className="label">Utilidad</div><div className="value">{fmtMoney(totUt)}</div></div>
        <div className="kpi"><div className="label">Margen</div><div className="value">{margen.toFixed(1)}%</div></div>
        <div className="kpi"><div className="label">Gramos en contrato</div><div className="value">{fmtGr(totGr)}</div></div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Comparar dos periodos — {branch}</h3></div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Periodo A</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={cmpA.month} onChange={(e) => setCmpA({ ...cmpA, month: parseInt(e.target.value, 10) })}>
                {MONTH_NAMES_FULL.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={cmpA.year} onChange={(e) => setCmpA({ ...cmpA, year: e.target.value })}>
                <option value="2026">2026</option><option value="2025">2025</option>
              </select>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Periodo B</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={cmpB.month} onChange={(e) => setCmpB({ ...cmpB, month: parseInt(e.target.value, 10) })}>
                {MONTH_NAMES_FULL.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={cmpB.year} onChange={(e) => setCmpB({ ...cmpB, year: e.target.value })}>
                <option value="2026">2026</option><option value="2025">2025</option>
              </select>
            </div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Concepto</th>
                <th>{MONTH_NAMES_FULL[cmpA.month]} {cmpA.year}</th>
                <th>{MONTH_NAMES_FULL[cmpB.month]} {cmpB.year}</th>
                <th>Variación</th>
              </tr>
            </thead>
            <tbody>
              {ALL_METRICS.map((m) => {
                const vA = series(monthly, branch, cmpA.year, m)[cmpA.month] || 0;
                const vB = series(monthly, branch, cmpB.year, m)[cmpB.month] || 0;
                let pill;
                if (!vA && vB) pill = <span className="pill pos" title="Repuntó desde cero">Repuntó</span>;
                else if (!vA && !vB) pill = <span className="pill neu">Sin actividad</span>;
                else { const pct = ((vB - vA) / Math.abs(vA)) * 100; pill = <span className={`pill ${pct >= 0 ? 'pos' : 'neg'}`}>{fmtPct(pct)}</span>; }
                return (
                  <tr key={m}>
                    <td className="name">{METRIC_LABEL[m]}</td>
                    <td>{fmtConcepto(m, vA)}</td>
                    <td>{fmtConcepto(m, vB)}</td>
                    <td>{pill}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>Evolución mensual</h3>
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {ALL_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
            </select>
          </div>
          <ChartCanvas
            height={220}
            config={{
              type: 'bar',
              data: { labels: MONTH_NAMES, datasets: [{ label: METRIC_LABEL[metric], data: chartData, backgroundColor: BRANCH_COLOR[branch], borderRadius: 5 }] },
              options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtByMetric(metric, c.raw) } } }, scales: { y: { ticks: { callback: (v) => (isMoney(metric) ? fmtMoneyShort(v) : v) } } } },
            }}
          />
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Canales de recaudo</h3></div>
          <ChartCanvas
            height={220}
            config={{
              type: 'doughnut',
              data: { labels: ['Recaudo Efecty', 'Recaudo Sistecrédito', 'Venta de oro', 'Venta de plata'], datasets: [{ data: [chEfecty, chSiste, chOro, chPlata], backgroundColor: ['#5b8dbe', '#7fa37a', '#e8cd7a', '#9b7ebd'], borderColor: '#1a2029', borderWidth: 2 }] },
              options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => c.label + ': ' + fmtMoney(c.raw) } } } },
            }}
          />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Tabla mensual completa</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th style={{ textAlign: 'left' }}>Mes</th><th>Gramos</th><th>Valor contratado</th><th>Utilidad</th><th>Prórroga</th><th>Venta oro (g)</th><th>Venta oro ($)</th><th>Efecty</th><th>Sistecrédito</th></tr></thead>
            <tbody>
              {Array.from({ length: year === '2026' ? lastM + 1 : 12 }).map((_, m) => (
                <tr key={m}>
                  <td className="name">{MONTH_NAMES_FULL[m]}</td>
                  <td>{fmtGr(series(monthly, branch, year, 'gr_contrato')[m])}</td>
                  <td>{fmtMoney(series(monthly, branch, year, 'valor_contratado')[m])}</td>
                  <td>{fmtMoney(series(monthly, branch, year, 'utilidad')[m])}</td>
                  <td>{fmtMoney(series(monthly, branch, year, 'prorroga')[m])}</td>
                  <td>{fmtGr(series(monthly, branch, year, 'venta_oro')[m])}</td>
                  <td>{fmtMoney(series(monthly, branch, year, 'valor_venta_oro')[m])}</td>
                  <td>{fmtMoney(series(monthly, branch, year, 'operacion_efecty')[m])}</td>
                  <td>{fmtMoney(series(monthly, branch, year, 'operacion_sistecredito')[m])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
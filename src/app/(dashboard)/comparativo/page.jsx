'use client';

import { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import ChartCanvas from '@/components/charts/ChartCanvas';
import {
  BRANCHES, BRANCH_COLOR, ALL_METRICS, METRIC_LABEL, MONTH_NAMES_FULL,
  fmtByMetric, fmtMoneyShort, fmtPct, isMoney, totalFor, lastActiveMonth2026,
} from '@/lib/dataHelpers';

export default function ComparativoPage() {
  const { monthly, loading } = useData();
  const [metric, setMetric] = useState('utilidad');

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>;

  const lastM = lastActiveMonth2026(monthly);
  const cutoff = lastM + 1;
  const periodo = `Ene–${MONTH_NAMES_FULL[lastM].slice(0, 3)}`;
  const d25 = BRANCHES.map((b) => totalFor(monthly, b, '2025', metric, cutoff));
  const d26 = BRANCHES.map((b) => totalFor(monthly, b, '2026', metric, cutoff));

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Comparativo entre sucursales</h1>
          <p>Enero–{MONTH_NAMES_FULL[lastM].toLowerCase()} 2025 vs. enero–{MONTH_NAMES_FULL[lastM].toLowerCase()} 2026, para comparar periodos equivalentes</p>
        </div>
        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          {ALL_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
        </select>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>{METRIC_LABEL[metric]} por sucursal ({periodo})</h3></div>
        <ChartCanvas
          height={110}
          config={{
            type: 'bar',
            data: {
              labels: BRANCHES,
              datasets: [
                { label: `${periodo} 2025`, data: d25, backgroundColor: '#3a4152', borderRadius: 4 },
                { label: `${periodo} 2026`, data: d26, backgroundColor: '#c7a339', borderRadius: 4 },
              ],
            },
            options: {
              plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmtByMetric(metric, c.raw) } } },
              scales: { y: { ticks: { callback: (v) => (isMoney(metric) ? fmtMoneyShort(v) : v) } } },
            },
          }}
        />
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Variación {periodo} 2025 vs {periodo} 2026</h3></div>
        <table>
          <thead><tr><th style={{ textAlign: 'left' }}>Sucursal</th><th>{periodo} 2025</th><th>{periodo} 2026</th><th>Variación</th></tr></thead>
          <tbody>
            {BRANCHES.map((b) => {
              const v25 = totalFor(monthly, b, '2025', metric, cutoff);
              const v26 = totalFor(monthly, b, '2026', metric, cutoff);
              let pill;
              if (!v25 && v26) pill = <span className="pill pos" title="Sucursal nueva / arrancando">Nueva</span>;
              else if (!v25 && !v26) pill = <span className="pill neu">Sin actividad</span>;
              else { const pct = ((v26 - v25) / Math.abs(v25)) * 100; pill = <span className={`pill ${pct >= 0 ? 'pos' : 'neg'}`}>{fmtPct(pct)}</span>; }
              return (
                <tr key={b}>
                  <td className="name"><span className="tag-dot" style={{ background: BRANCH_COLOR[b] }} />{b}</td>
                  <td>{fmtByMetric(metric, v25)}</td><td>{fmtByMetric(metric, v26)}</td><td>{pill}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
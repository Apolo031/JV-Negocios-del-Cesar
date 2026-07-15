'use client';

import { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import ChartCanvas from '@/components/charts/ChartCanvas';
import { BRANCHES, BRANCH_COLOR, fmtMoney, fmtMoneyShort, fmtNum, fmtPct } from '@/lib/dataHelpers';

const WEEK_BRANCH_KEY = { Barranquilla: 'Barranquillera', Caucasia: 'Caucasia', Euro: 'Euro', Heroica: 'Heroica', Sinú: 'Sinú' };
const WEEK_METRIC_LABEL = { gramos: 'Gramos en contrato', valor_contratado: 'Valor contratado', utilidad: 'Utilidad', venta_oro: 'Venta de oro (g)', prorroga: 'Prórrogas' };
const WEEK_METRIC_IS_MONEY = { gramos: false, valor_contratado: true, utilidad: true, venta_oro: false, prorroga: true };

export default function SemanalPage() {
  const { weekly, loading } = useData();
  const [metric, setMetric] = useState('utilidad');

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>;
  if (weekly.length === 0) {
    return (
      <div>
        <div className="topbar"><div><h1>Seguimiento semanal</h1><p>Comparación de los reportes de avance semanal más recientes</p></div></div>
        <div className="empty-note">Todavía no hay reportes semanales cargados.</div>
      </div>
    );
  }

  const fmtWeek = (v) => (WEEK_METRIC_IS_MONEY[metric] ? fmtMoney(v) : fmtNum(v));
  const w0 = weekly[weekly.length - 2] || weekly[0];
  const w1 = weekly[weekly.length - 1];

  return (
    <div>
      <div className="topbar">
        <div><h1>Seguimiento semanal</h1><p>Comparación de los reportes de avance semanal más recientes</p></div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{WEEK_METRIC_LABEL[metric]} por semana y sucursal</h3>
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            {Object.keys(WEEK_METRIC_LABEL).map((m) => <option key={m} value={m}>{WEEK_METRIC_LABEL[m]}</option>)}
          </select>
        </div>
        <ChartCanvas
          height={110}
          config={{
            type: 'bar',
            data: {
              labels: BRANCHES,
              datasets: [w0, w1].filter(Boolean).map((wk, i) => ({
                label: wk.fecha,
                data: BRANCHES.map((b) => (wk.sucursales?.[WEEK_BRANCH_KEY[b]]?.[metric]) || 0),
                backgroundColor: i === 0 ? '#3a4152' : '#c7a339',
                borderRadius: 5,
              })),
            },
            options: { plugins: { legend: { labels: { boxWidth: 12 } } }, scales: { y: { ticks: { callback: (v) => (WEEK_METRIC_IS_MONEY[metric] ? fmtMoneyShort(v) : v) } } } },
          }}
        />
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Comparación semana a semana</h3></div>
        <table>
          <thead><tr><th style={{ textAlign: 'left' }}>Sucursal</th><th>{w0.fecha}</th><th>{w1 ? w1.fecha : ''}</th><th>Variación</th></tr></thead>
          <tbody>
            {BRANCHES.map((b) => {
              const k = WEEK_BRANCH_KEY[b];
              const v1 = w0.sucursales?.[k]?.[metric] || 0;
              const v2 = w1 ? (w1.sucursales?.[k]?.[metric] || 0) : null;
              let pill = <>—</>;
              if (v2 !== null) {
                if (!v1 && v2) pill = <span className="pill pos">Repuntó desde cero</span>;
                else if (!v1 && !v2) pill = <span className="pill neu">Sin actividad</span>;
                else { const pct = ((v2 - v1) / Math.abs(v1)) * 100; pill = <span className={`pill ${pct >= 0 ? 'pos' : 'neg'}`}>{fmtPct(pct)}</span>; }
              }
              return (
                <tr key={b}>
                  <td className="name"><span className="tag-dot" style={{ background: BRANCH_COLOR[b] }} />{b}</td>
                  <td>{fmtWeek(v1)}</td><td>{v2 !== null ? fmtWeek(v2) : '—'}</td><td>{pill}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

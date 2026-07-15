$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$content = @'
:root{
  --bg:#12151c; --surface:#1a2029; --surface-2:#212838; --border:#2a3242;
  --text:#edeff3; --text-dim:#8d96ac; --text-dimmer:#5e6678;
  --gold:#c7a339; --gold-light:#e8cd7a; --gold-deep:#8a6a1f;
  --green:#4f9d69; --red:#c1443a;
  --shadow: 0 1px 0 rgba(255,255,255,0.03);
  color-scheme: dark;
}
:root[data-theme="light"]{
  --bg:#f6f4ef; --surface:#ffffff; --surface-2:#f0ece2; --border:#e2dcca;
  --text:#262319; --text-dim:#6b6555; --text-dimmer:#9a927c;
  --gold:#a9812a; --gold-light:#8a6a1f; --gold-deep:#6b5119;
  --green:#2f8f57; --red:#b23a2f;
  --shadow: 0 1px 2px rgba(30,25,10,0.06);
  color-scheme: light;
}
body, .kpi, .panel, .sidebar, select, input, .btn-outline, .alert-card{
  transition: background-color .2s ease, border-color .2s ease, color .2s ease;
}
*{box-sizing:border-box; margin:0; padding:0;}
html,body{height:100%;}
body{
  background:
    radial-gradient(ellipse 900px 500px at 85% -10%, rgba(199,163,57,0.10), transparent 60%),
    var(--bg);
  color:var(--text);
  font-family:'Inter',sans-serif;
  -webkit-font-smoothing:antialiased;
  min-height:100vh;
}
.tabular{font-family:'IBM Plex Mono',monospace; font-variant-numeric:tabular-nums;}
::-webkit-scrollbar{width:8px; height:8px;}
::-webkit-scrollbar-thumb{background:var(--border); border-radius:4px;}

.shell{display:flex; min-height:100vh; position:relative;}

.mobile-topbar{
  display:none;
  position:sticky; top:0; z-index:30;
  align-items:center; gap:12px;
  padding:12px 16px;
  background:var(--surface); border-bottom:1px solid var(--border);
}
.mobile-topbar .mark{font-family:'Fraunces', serif; font-weight:700; font-size:16px; color:var(--gold-light);}
.hamburger-btn{
  background:var(--surface-2); border:1px solid var(--border); border-radius:8px;
  width:36px; height:36px; flex-shrink:0; cursor:pointer; color:var(--text);
  display:flex; align-items:center; justify-content:center; font-size:18px;
}
.sidebar-backdrop{display:none;}

.sidebar{
  width:230px; flex-shrink:0;
  background:linear-gradient(180deg, #171c25, #12151c);
  border-right:1px solid var(--border);
  padding:26px 18px;
  display:flex; flex-direction:column; gap:6px;
  position:sticky; top:0; height:100vh;
  overflow-y:auto;
}
.brand{margin-bottom:28px; padding:0 6px;}
.brand .mark{
  font-family:'Fraunces', serif; font-weight:700; font-size:22px; letter-spacing:0.01em;
  color:var(--gold-light); display:flex; align-items:center; gap:8px;
}
.brand .sub{font-size:11px; color:var(--text-dimmer); margin-top:4px; letter-spacing:0.06em; text-transform:uppercase;}

.nav-item{
  display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:8px;
  color:var(--text-dim); font-size:13.5px; font-weight:500; cursor:pointer; border:1px solid transparent;
  transition:background .15s, color .15s; text-decoration:none;
}
.nav-item:hover{background:var(--surface); color:var(--text);}
.nav-item.active{
  background:linear-gradient(90deg, rgba(199,163,57,0.16), rgba(199,163,57,0.03));
  color:var(--gold-light); border-color:rgba(199,163,57,0.25);
}
.nav-item.disabled{opacity:.35; pointer-events:none;}

.sidebar-foot{
  margin-top:auto; padding:12px; border-radius:10px; background:var(--surface); border:1px solid var(--border);
  font-size:11.5px; color:var(--text-dimmer); line-height:1.5;
}
.sidebar-foot b{color:var(--text-dim);}

.main{flex:1; min-width:0; padding:28px 34px 60px; overflow-x:hidden;}
.topbar{display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:26px; flex-wrap:wrap;}
.topbar h1{font-family:'Fraunces', serif; font-weight:600; font-size:26px;}
.topbar p{color:var(--text-dim); font-size:13.5px; margin-top:5px;}
.topbar select, .topbar .btn-group, .topbar input{max-width:100%;}

.kpi-row{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:22px;}
.kpi{background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px 18px 16px; position:relative; overflow:hidden;}
.kpi::before{content:""; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg, var(--gold), transparent);}
.kpi .label{font-size:11.5px; color:var(--text-dim); text-transform:uppercase; letter-spacing:.05em; margin-bottom:10px;}
.kpi .value{font-family:'IBM Plex Mono',monospace; font-size:23px; font-weight:600; color:var(--text); word-break:break-word;}
.kpi .delta{font-size:12px; margin-top:8px; display:flex; align-items:center; gap:4px;}
.delta.up{color:var(--green);} .delta.down{color:var(--red);}

.panel{background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px 22px; margin-bottom:20px; min-width:0;}
.panel-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:12px; flex-wrap:wrap;}
.panel-head h3{font-size:14.5px; font-weight:600; color:var(--text);}
.panel-head .hint{font-size:11.5px; color:var(--text-dimmer);}

.grid-2{display:grid; grid-template-columns:1.3fr 1fr; gap:20px;}
@media (max-width:1080px){.grid-2{grid-template-columns:1fr;} .kpi-row{grid-template-columns:repeat(2,1fr);}}

/* ---- Formularios de varias columnas (registro de publicidad, crear usuario) ---- */
.form-grid{display:grid; grid-template-columns:repeat(6,1fr); gap:10px; align-items:end;}
.form-grid.cols-5{grid-template-columns:repeat(5,1fr);}
.form-grid .fg-span2{grid-column:span 2;}
.form-grid .fg-span5{grid-column:span 5;}

/* ============================================================
   RESPONSIVE — tablets y celulares
   ============================================================ */
.sidebar-close-btn{display:none;}

@media (max-width:900px){
  .shell{flex-direction:column;}
  .mobile-topbar{width:100%;}
  .mobile-topbar{display:flex;}
  .sidebar-close-btn{display:flex;}
  .sidebar-backdrop{
    display:block; position:fixed; inset:0; background:rgba(0,0,0,0.5);
    z-index:39; opacity:0; pointer-events:none; transition:opacity .2s ease;
  }
  .sidebar-backdrop.open{opacity:1; pointer-events:auto;}
  .sidebar{
    position:fixed; top:0; left:0; height:100vh; z-index:40;
    transform:translateX(-100%); transition:transform .2s ease;
    width:260px; max-width:82vw;
    box-shadow:2px 0 24px rgba(0,0,0,0.35);
  }
  .sidebar.open{transform:translateX(0);}
  .main{padding:18px 16px 48px;}
  .topbar h1{font-size:21px;}
  .topbar{margin-bottom:18px;}
  .kpi-row{grid-template-columns:repeat(2,1fr); gap:10px;}
  .panel{padding:16px 14px;}
  .ingot-name{width:72px; font-size:11.5px;}
  .ingot-value{width:96px; font-size:11px;}
  .form-grid, .form-grid.cols-5{grid-template-columns:repeat(2,1fr);}
  .form-grid .fg-span2, .form-grid .fg-span5{grid-column:span 2;}
}

@media (max-width:700px){
  table{font-size:12px;}
  th, td{padding:7px 8px;}
  .pill{font-size:10.5px; padding:2px 7px;}
}

@media (max-width:520px){
  .kpi-row{grid-template-columns:1fr;}
  .topbar h1{font-size:19px;}
  .panel-head h3{font-size:13.5px;}
  .ingot-rank{display:none;}
  .form-grid, .form-grid.cols-5{grid-template-columns:1fr;}
  .form-grid .fg-span2, .form-grid .fg-span5{grid-column:span 1;}
  table{font-size:11.5px;}
  th, td{padding:6px 7px;}
}

select, input, .select{
  background:var(--surface-2); color:var(--text); border:1px solid var(--border); border-radius:7px;
  padding:7px 10px; font-size:12.5px; font-family:'Inter',sans-serif; cursor:pointer; outline:none;
}
select:focus, input:focus{border-color:var(--gold-deep);}

.btn{
  background:var(--gold); color:#1a1200; border:none; border-radius:7px; padding:8px 14px;
  font-weight:600; font-size:12.5px; cursor:pointer;
}
.btn-outline{
  background:var(--surface-2); color:var(--text-dim); border:1px solid var(--border); border-radius:7px;
  padding:8px 14px; font-size:12.5px; cursor:pointer;
}
.btn-group{display:flex; gap:4px; background:var(--surface-2); padding:3px; border-radius:8px; border:1px solid var(--border);}
.btn-toggle{padding:6px 12px; font-size:12px; border-radius:6px; cursor:pointer; color:var(--text-dim); font-weight:500; transition:background .15s, color .15s; border:none; background:none;}
.btn-toggle.active{background:var(--gold); color:#1a1200;}

.ingot-row{display:flex; align-items:center; gap:12px; margin-bottom:14px;}
.ingot-rank{font-family:'Fraunces',serif; font-size:15px; color:var(--text-dimmer); width:18px; flex-shrink:0;}
.ingot-name{width:98px; flex-shrink:0; font-size:12.5px; font-weight:600; color:var(--text);}
.ingot-track{flex:1; height:22px; background:var(--surface-2); border-radius:5px; overflow:hidden; position:relative; border:1px solid var(--border);}
.ingot-fill{
  height:100%; border-radius:5px 3px 3px 5px;
  background:linear-gradient(180deg, var(--gold-light) 0%, var(--gold) 45%, var(--gold-deep) 100%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -3px 4px rgba(0,0,0,0.35);
  position:relative; transition:width .6s ease;
}
.ingot-value{width:150px; text-align:right; flex-shrink:0; font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--gold-light);}

table{width:100%; border-collapse:collapse; font-size:12.5px;}
th{text-align:right; color:var(--text-dimmer); font-weight:600; font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; padding:8px 10px; border-bottom:1px solid var(--border);}
th:first-child, td:first-child{text-align:left;}
td{padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.04); text-align:right; font-family:'IBM Plex Mono',monospace; color:var(--text);}
tr:hover td{background:rgba(255,255,255,0.02);}
td.name{font-family:'Inter',sans-serif; font-weight:500;}
.tag-dot{display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:7px;}

.pill{display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:99px; font-size:11px; font-weight:600; white-space:nowrap;}
.pill.pos{background:rgba(79,157,105,0.15); color:var(--green);}
.pill.neg{background:rgba(193,68,58,0.15); color:var(--red);}
.pill.neu{background:rgba(141,150,172,0.15); color:var(--text-dim);}

.alert-card{display:flex; gap:14px; padding:16px 18px; border-radius:10px; margin-bottom:12px; border:1px solid var(--border); background:var(--surface-2); border-left:3px solid var(--text-dimmer);}
.alert-card.sev-high{border-left-color:var(--red);}
.alert-card.sev-med{border-left-color:var(--gold);}
.alert-card.sev-low{border-left-color:var(--green);}
.alert-icon{width:34px; height:34px; border-radius:8px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:16px; background:rgba(255,255,255,0.04);}
.alert-card.sev-high .alert-icon{color:var(--red);}
.alert-card.sev-med .alert-icon{color:var(--gold-light);}
.alert-card.sev-low .alert-icon{color:var(--green);}
.alert-body .alert-title{font-size:13.5px; font-weight:600; margin-bottom:3px;}
.alert-body .alert-desc{font-size:12.5px; color:var(--text-dim); line-height:1.5;}
.alert-empty{text-align:center; padding:40px 20px; color:var(--text-dim); font-size:13px;}

.legend-row{display:flex; gap:16px; flex-wrap:wrap; margin-top:10px;}
.legend-item{display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-dim);}
.legend-item .sw{width:10px; height:10px; border-radius:3px;}

.empty-note{font-size:12px; color:var(--text-dimmer); font-style:italic; padding:10px 0;}
.readonly-banner{
  border-left:3px solid var(--gold); background:linear-gradient(90deg, rgba(199,163,57,0.08), var(--surface));
  font-size:12.5px; color:var(--text-dim); line-height:1.6; padding:16px 20px; border-radius:12px; margin-bottom:20px;
  border:1px solid var(--border);
}
.readonly-banner b{color:var(--gold-light);}

.login-shell{min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px;}
.login-card{width:100%; max-width:360px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:32px 28px;}
.login-card label{display:block; font-size:11.5px; color:var(--text-dimmer); margin-bottom:6px; margin-top:16px;}
.login-card input{width:100%;}
.login-error{color:var(--red); font-size:12.5px; margin-top:14px;}
'@
[System.IO.File]::WriteAllText("$PWD\src\app\globals.css", $content, $utf8NoBom)

$content = @'
'use client';

import { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import ChartCanvas from '@/components/charts/ChartCanvas';
import {
  BRANCHES, BRANCH_COLOR, METRIC_LABEL,
  fmtByMetric, fmtMoneyShort, fmtPct, isMoney, totalFor, lastActiveMonth2026,
} from '@/lib/dataHelpers';

const METRIC_OPTIONS = ['utilidad', 'valor_contratado', 'gr_contrato', 'valor_venta_oro', 'valor_venta_plata', 'prorroga', 'operacion_efecty', 'operacion_sistecredito'];

export default function ComparativoPage() {
  const { monthly, loading } = useData();
  const [metric, setMetric] = useState('utilidad');

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>;

  const lastM = lastActiveMonth2026(monthly);
  const cutoff = Math.min(lastM + 1, 6);
  const d25 = BRANCHES.map((b) => totalFor(monthly, b, '2025', metric, cutoff));
  const d26 = BRANCHES.map((b) => totalFor(monthly, b, '2026', metric, cutoff));

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Comparativo entre sucursales</h1>
          <p>Enero–junio 2025 vs. enero–junio 2026, para comparar periodos equivalentes</p>
        </div>
        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          {METRIC_OPTIONS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
        </select>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>{METRIC_LABEL[metric]} por sucursal (Ene–Jun)</h3></div>
        <ChartCanvas
          height={110}
          config={{
            type: 'bar',
            data: {
              labels: BRANCHES,
              datasets: [
                { label: 'Ene–Jun 2025', data: d25, backgroundColor: '#3a4152', borderRadius: 4 },
                { label: 'Ene–Jun 2026', data: d26, backgroundColor: '#c7a339', borderRadius: 4 },
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
        <div className="panel-head"><h3>Variación Ene–Jun 2025 vs Ene–Jun 2026</h3></div>
        <table>
          <thead><tr><th style={{ textAlign: 'left' }}>Sucursal</th><th>Ene–Jun 2025</th><th>Ene–Jun 2026</th><th>Variación</th></tr></thead>
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
'@
[System.IO.File]::WriteAllText("$PWD\src\app\(dashboard)\comparativo\page.jsx", $content, $utf8NoBom)

$content = @'
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
                if (!v1 && v2) pill = <span className="pill pos" title="Repuntó desde cero">Repuntó</span>;
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
'@
[System.IO.File]::WriteAllText("$PWD\src\app\(dashboard)\semanal\page.jsx", $content, $utf8NoBom)

Write-Host "Listo: tablas mas compactas en movil." -ForegroundColor Green

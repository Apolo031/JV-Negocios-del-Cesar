'use client';

import { useState } from 'react';
import RequireAdmin from '@/components/RequireAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import ChartCanvas from '@/components/charts/ChartCanvas';
import {
  BRANCHES, BRANCH_COLOR, ALL_METRICS, METRIC_LABEL, MONTH_NAMES, MONTH_NAMES_FULL,
  fmtMoney, fmtMoneyShort, fmtGr, fmtByMetric, fmtConcepto,
  series, totalFor, lastActiveMonth2026,
} from '@/lib/dataHelpers';

// Las 8 métricas que el PDF de "Movimientos de Caja Consolidados" trae — las
// mismas que ya se cargan a mano en "Editar datos". Efecty/Sistecrédito no
// se extraen todavía (el PDF los trae en otra sección con otro formato).
const METRICAS_PDF = ['gr_contrato', 'valor_contratado', 'utilidad', 'prorroga', 'venta_oro', 'valor_venta_oro', 'venta_plata', 'valor_venta_plata'];

const AÑOS = ['2026', '2025'];

// Panel de resumen: queda siempre visible en esta misma pantalla (arriba de
// la zona de carga) para que, apenas se guarda un consolidado, se vea de una
// el efecto en todas las joyerías sin salir de "Consolidados". Lee en vivo
// del mismo `monthly` que ya actualiza "Editar datos", así que se refresca
// solo en cuanto se guarda.
function ResumenGeneral({ monthly }) {
  const [period, setPeriod] = useState('ytd'); // 'ytd' | 'mes' | '2025'
  const [mesIndividual, setMesIndividual] = useState(null);

  const lastM = lastActiveMonth2026(monthly);
  const mesSel = mesIndividual === null ? lastM : mesIndividual;
  const isMes = period === 'mes';
  const year = period === '2025' ? '2025' : '2026';
  const upto = period === '2025' ? 12 : lastM + 1;

  function valFor(y, branch, metric) {
    return isMes ? (series(monthly, branch, y, metric)[mesSel] || 0) : totalFor(monthly, branch, y, metric, upto);
  }
  function valAllFor(y, metric) {
    return BRANCHES.reduce((s, b) => s + valFor(y, b, metric), 0);
  }

  const totalContratado = valAllFor(year, 'valor_contratado');
  const totalUtilidad = valAllFor(year, 'utilidad');
  const totalGramos = valAllFor(year, 'gr_contrato');
  const margen = totalContratado ? (totalUtilidad / totalContratado) * 100 : 0;

  const periodoLabel = period === '2025' ? '2025, año completo' : (isMes ? `${MONTH_NAMES_FULL[mesSel]} 2026` : `2026, Ene–${MONTH_NAMES[lastM]}`);

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h3>Resumen general — todas las joyerías</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="btn-group">
              <button className={`btn-toggle${period === 'ytd' ? ' active' : ''}`} onClick={() => setPeriod('ytd')}>Año en curso</button>
              <button className={`btn-toggle${isMes ? ' active' : ''}`} onClick={() => setPeriod('mes')}>Un mes</button>
              <button className={`btn-toggle${period === '2025' ? ' active' : ''}`} onClick={() => setPeriod('2025')}>Todo 2025</button>
            </div>
            {isMes && (
              <select value={mesSel} onChange={(e) => setMesIndividual(parseInt(e.target.value, 10))} title="Mes a mostrar">
                {MONTH_NAMES_FULL.slice(0, lastM + 1).map((m, i) => <option key={m} value={i}>{m} 2026</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="kpi-row">
          <div className="kpi">
            <div className="label">Valor contratado</div>
            <div className="value">{fmtMoney(totalContratado)}</div>
          </div>
          <div className="kpi">
            <div className="label">Utilidad total</div>
            <div className="value">{fmtMoney(totalUtilidad)}</div>
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
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Comparativo por sucursal — valor contratado y utilidad</h3>
          <span className="hint">{periodoLabel}</span>
        </div>
        <ChartCanvas
          height={260}
          config={{
            type: 'bar',
            data: {
              labels: BRANCHES,
              datasets: [
                { label: 'Valor contratado', data: BRANCHES.map((b) => valFor(year, b, 'valor_contratado')), backgroundColor: 'rgba(199,163,57,0.55)', borderColor: '#c7a339', borderWidth: 1, borderRadius: 4 },
                { label: 'Utilidad', data: BRANCHES.map((b) => valFor(year, b, 'utilidad')), backgroundColor: 'rgba(91,141,190,0.65)', borderColor: '#5b8dbe', borderWidth: 1, borderRadius: 4 },
              ],
            },
            options: {
              plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMoney(c.raw)}` } } },
              scales: { y: { ticks: { callback: (v) => fmtMoneyShort(v) } } },
            },
          }}
        />
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
    </>
  );
}

function ConsolidadosInner() {
  const { getIdToken } = useAuth();
  const { monthly, saveMonthlyMetric } = useData();

  const [file, setFile] = useState(null);
  const [extrayendo, setExtrayendo] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null); // lo que devolvió el PDF
  const [sucursal, setSucursal] = useState('');
  const [año, setAño] = useState('2026');
  const [mesIdx, setMesIdx] = useState(0); // 0-based
  const [valores, setValores] = useState(null); // editable, precargado del PDF
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  function limpiarTodo() {
    setFile(null); setResultado(null); setValores(null); setError(''); setGuardadoOk(false);
  }

  async function handleExtraer() {
    if (!file) { setError('Elige primero el PDF del consolidado.'); return; }
    setExtrayendo(true);
    setError('');
    setGuardadoOk(false);
    try {
      const token = await getIdToken();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/parse-consolidado', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo leer el PDF');
      setResultado(data);
      setSucursal(data.sucursal && BRANCHES.includes(data.sucursal) ? data.sucursal : BRANCHES[0]);
      setAño(data.anio || '2026');
      setMesIdx(data.mes ? data.mes - 1 : 0);
      setValores({ ...data.valores });
    } catch (err) {
      setError(err.message);
    } finally {
      setExtrayendo(false);
    }
  }

  async function handleGuardar() {
    setGuardando(true);
    setError('');
    try {
      for (const metric of METRICAS_PDF) {
        const actual = series(monthly, sucursal, año, metric);
        const nuevo = [...actual];
        nuevo[mesIdx] = valores[metric];
        await saveMonthlyMetric(sucursal, año, metric, nuevo);
      }
      setGuardadoOk(true);
    } catch (err) {
      setError('No se pudo guardar: ' + err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Consolidados</h1><p>Sube el PDF de "Movimientos de caja consolidados" de una sucursal y extrae sus indicadores automáticamente</p></div>
      </div>

      <div className="readonly-banner">
        Los números se extraen del PDF pero <b>no se guardan solos</b>: revísalos (y corrígelos si hace falta) antes de darle "Guardar en Editar datos".
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="panel">
        <div className="panel-head"><h3>Subir consolidado</h3></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="file" accept="application/pdf" onChange={(e) => { setFile(e.target.files[0] || null); setResultado(null); }} style={{ fontSize: 12, color: 'var(--text-dim)' }} />
          <button className="btn" type="button" onClick={handleExtraer} disabled={extrayendo || !file}>
            {extrayendo ? 'Leyendo PDF…' : 'Extraer datos'}
          </button>
          {resultado && <button className="btn-outline" type="button" onClick={limpiarTodo}>Subir otro</button>}
        </div>
      </div>

      <ResumenGeneral monthly={monthly} />

      {resultado && valores && (
        <>
          <div className="panel">
            <div className="panel-head"><h3>¿A qué sucursal y mes corresponde?</h3></div>
            {resultado.codigoDetectado && (
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14 }}>
                Código detectado en el PDF: <b>{resultado.codigoDetectado}</b>
                {!resultado.sucursal && ' — no se reconoció a cuál de las 6 sucursales corresponde, elígela abajo.'}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Sucursal</div>
                <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
                  {BRANCHES.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Año</div>
                <select value={año} onChange={(e) => setAño(e.target.value)}>
                  {AÑOS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Mes</div>
                <select value={mesIdx} onChange={(e) => setMesIdx(parseInt(e.target.value, 10))}>
                  {MONTH_NAMES_FULL.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Valores a guardar</h3>
              <button className="btn" type="button" onClick={handleGuardar} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar en Editar datos'}
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr><th style={{ textAlign: 'left' }}>Métrica</th><th>Valor actual guardado</th><th>Valor extraído del PDF</th></tr>
                </thead>
                <tbody>
                  {METRICAS_PDF.map((metric) => {
                    const actual = series(monthly, sucursal, año, metric)[mesIdx] || 0;
                    const nuevo = valores[metric];
                    const cambia = actual !== nuevo;
                    return (
                      <tr key={metric}>
                        <td className="name">{METRIC_LABEL[metric]}</td>
                        <td style={{ color: 'var(--text-dim)' }}>{fmtByMetric(metric, actual)}</td>
                        <td>
                          <input
                            type="number" step="any"
                            value={nuevo}
                            onChange={(e) => setValores({ ...valores, [metric]: parseFloat(e.target.value) || 0 })}
                            style={{ width: 130, textAlign: 'right', fontWeight: cambia ? 700 : 400, color: cambia ? 'var(--gold-light)' : undefined }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {guardadoOk && <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 12 }}>Guardado: {sucursal} · {MONTH_NAMES_FULL[mesIdx]} {año}.</div>}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Detalle de respaldo (del PDF, no se guarda)</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th style={{ textAlign: 'left' }}>Tabla del PDF</th><th>Gramos</th><th>Valor</th><th>Promedio</th></tr></thead>
                <tbody>
                  <tr>
                    <td className="name">Contratos oro</td>
                    <td>{resultado.detalle.contratosOro.gramos}</td>
                    <td>{fmtByMetric('valor_contratado', resultado.detalle.contratosOro.valorArticulos)}</td>
                    <td>{fmtByMetric('valor_contratado', resultado.detalle.contratosOro.promedio)}</td>
                  </tr>
                  <tr>
                    <td className="name">Contratos plata (gramos)</td>
                    <td>{resultado.detalle.contratosPlataGramos.gramos}</td>
                    <td>{fmtByMetric('valor_contratado', resultado.detalle.contratosPlataGramos.valorArticulos)}</td>
                    <td>{fmtByMetric('valor_contratado', resultado.detalle.contratosPlataGramos.promedio)}</td>
                  </tr>
                  <tr>
                    <td className="name">Ventas oro</td>
                    <td>{resultado.detalle.ventasOro.grm}</td>
                    <td colSpan={2}>{fmtByMetric('valor_venta_oro', resultado.detalle.ventasOro.total)}</td>
                  </tr>
                  <tr>
                    <td className="name">Ventas plata (gramos)</td>
                    <td>{resultado.detalle.ventasPlataGramos.grm}</td>
                    <td colSpan={2}>{fmtByMetric('valor_venta_plata', resultado.detalle.ventasPlataGramos.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ConsolidadosPage() {
  return (
    <RequireAdmin>
      <ConsolidadosInner />
    </RequireAdmin>
  );
}

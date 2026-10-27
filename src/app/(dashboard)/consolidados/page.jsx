'use client';

import { useState } from 'react';
import RequireAdmin from '@/components/RequireAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { BRANCHES, METRIC_LABEL, MONTH_NAMES_FULL, fmtByMetric, series } from '@/lib/dataHelpers';

// Las 8 métricas que el PDF de "Movimientos de Caja Consolidados" trae — las
// mismas que ya se cargan a mano en "Editar datos". Efecty/Sistecrédito no
// se extraen todavía (el PDF los trae en otra sección con otro formato).
const METRICAS_PDF = ['gr_contrato', 'valor_contratado', 'utilidad', 'prorroga', 'venta_oro', 'valor_venta_oro', 'venta_plata', 'valor_venta_plata'];

const AÑOS = ['2026', '2025'];

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

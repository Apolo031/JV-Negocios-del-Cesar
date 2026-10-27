'use client';

import { useRef, useState } from 'react';
import RequireAdmin from '@/components/RequireAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { BRANCHES, EDIT_METRICS, METRIC_LABEL, MONTH_NAMES, MONTH_NAMES_FULL, fmtByMetric, series } from '@/lib/dataHelpers';

// Los 8 indicadores que traen los PDF de caja (consolidado mensual o cuadre
// diario) — los dos últimos de EDIT_METRICS (recaudo Efecty/Sistecrédito)
// no vienen en ninguno de los dos formatos todavía.
const METRICAS_PDF = EDIT_METRICS.slice(0, 8);
const AÑOS = ['2026', '2025'];

const campoLabel = { fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 };

const TIPO_INFO = {
  consolidado: {
    titulo: 'Panel de Consolidado',
    nombrePdf: '"Movimientos de Caja Consolidados"',
    descripcion: 'Sube aquí el PDF del consolidado del periodo (normalmente un mes). Ya trae el total, así que reemplaza directo el valor del mes.',
    nombreOtro: 'Cuadre de caja',
  },
  cuadre: {
    titulo: 'Panel de Cuadre de caja',
    nombrePdf: '"Cuadre de Caja"',
    descripcion: 'Sube aquí el PDF del cierre de un solo día. Se suma al valor que ya tenía guardado ese mes, para ir construyendo el mes día a día.',
    nombreOtro: 'Consolidado',
  },
};

function PanelPdfCaja({ tipoEsperado, branch, year, monthly, onAplicar }) {
  const info = TIPO_INFO[tipoEsperado];
  const { getIdToken } = useAuth();
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [extrayendo, setExtrayendo] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [sucursalSel, setSucursalSel] = useState(branch);
  const [añoSel, setAñoSel] = useState(year);
  const [mesIdx, setMesIdx] = useState(0);
  const [valores, setValores] = useState(null);
  const [aplicado, setAplicado] = useState(false);

  function limpiar() {
    setFile(null); setResultado(null); setValores(null); setError(''); setAplicado(false);
  }

  function elegirArchivo(f) {
    if (!f) return;
    if (f.type !== 'application/pdf') { setError('El archivo debe ser un PDF.'); return; }
    setFile(f); setResultado(null); setValores(null); setError(''); setAplicado(false);
  }

  function recomputar(resultadoPdf, suc, an, mi) {
    if (tipoEsperado === 'cuadre') {
      // Cuadre de caja = el cierre de un solo día: se suma a lo que ya
      // había guardado ese mes, para ir construyendo el mes día a día.
      const nuevos = {};
      METRICAS_PDF.forEach((m) => {
        const actual = series(monthly, suc, an, m)[mi] || 0;
        nuevos[m] = actual + (resultadoPdf.valores[m] || 0);
      });
      setValores(nuevos);
    } else {
      // Consolidado = ya trae el total del periodo: reemplaza directo.
      setValores({ ...resultadoPdf.valores });
    }
  }

  async function handleExtraer() {
    if (!file) { setError('Arrastra o elige primero el PDF.'); return; }
    setExtrayendo(true);
    setError('');
    setAplicado(false);
    try {
      const token = await getIdToken();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/parse-caja-pdf', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo leer el PDF');
      if (data.tipo !== tipoEsperado) {
        throw new Error(`Este PDF parece ser de ${TIPO_INFO[data.tipo]?.nombrePdf || 'otro formato'} — súbelo en el panel de "${TIPO_INFO[data.tipo]?.titulo || info.nombreOtro}".`);
      }
      const suc = data.sucursal && BRANCHES.includes(data.sucursal) ? data.sucursal : branch;
      const an = data.anio || year;
      const mi = data.mes ? data.mes - 1 : 0;
      setResultado(data);
      setSucursalSel(suc);
      setAñoSel(an);
      setMesIdx(mi);
      recomputar(data, suc, an, mi);
    } catch (err) {
      setError(err.message);
    } finally {
      setExtrayendo(false);
    }
  }

  function handleAplicar() {
    onAplicar(sucursalSel, añoSel, mesIdx, valores);
    setAplicado(true);
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>{info.titulo}</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        {info.descripcion} Revisa los números antes de aplicarlos a la tabla de abajo — no se guardan solos.
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); elegirArchivo(e.dataTransfer.files?.[0]); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--gold)' : 'var(--border)'}`,
          borderRadius: 10, padding: '26px 16px', textAlign: 'center', cursor: 'pointer',
          background: dragOver ? 'rgba(199,163,57,0.08)' : 'var(--surface-2)',
        }}
      >
        <input
          ref={inputRef} type="file" accept="application/pdf" style={{ display: 'none' }}
          onChange={(e) => elegirArchivo(e.target.files?.[0])}
        />
        {file ? (
          <div style={{ fontSize: 13 }}>📄 <b>{file.name}</b></div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Arrastra el PDF aquí, o haz clic para elegirlo</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
        <button className="btn" type="button" onClick={handleExtraer} disabled={extrayendo || !file}>
          {extrayendo ? 'Leyendo PDF…' : 'Extraer datos'}
        </button>
        {(file || resultado) && <button className="btn-outline" type="button" onClick={limpiar}>Quitar</button>}
      </div>

      {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}

      {resultado && valores && (
        <>
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 10 }}>
              {tipoEsperado === 'cuadre' ? 'Cuadre de caja diario' : 'Consolidado del periodo'}
              {resultado.codigoDetectado && <> · Código detectado: <b>{resultado.codigoDetectado}</b></>}
              {!(resultado.sucursal && BRANCHES.includes(resultado.sucursal)) && ' · no se reconoció la sucursal, elígela abajo'}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={campoLabel}>Sucursal</div>
                <select value={sucursalSel} onChange={(e) => { const v = e.target.value; setSucursalSel(v); recomputar(resultado, v, añoSel, mesIdx); }}>
                  {BRANCHES.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <div style={campoLabel}>Año</div>
                <select value={añoSel} onChange={(e) => { const v = e.target.value; setAñoSel(v); recomputar(resultado, sucursalSel, v, mesIdx); }}>
                  {AÑOS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <div style={campoLabel}>Mes</div>
                <select value={mesIdx} onChange={(e) => { const v = parseInt(e.target.value, 10); setMesIdx(v); recomputar(resultado, sucursalSel, añoSel, v); }}>
                  {MONTH_NAMES_FULL.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Métrica</th>
                  <th>Valor actual guardado</th>
                  <th>Valor extraído del PDF</th>
                  <th>{tipoEsperado === 'cuadre' ? 'A aplicar (actual + extraído)' : 'A aplicar'}</th>
                </tr>
              </thead>
              <tbody>
                {METRICAS_PDF.map((metric) => {
                  const actual = series(monthly, sucursalSel, añoSel, metric)[mesIdx] || 0;
                  const extraido = resultado.valores[metric];
                  const nuevo = valores[metric];
                  const cambia = actual !== nuevo;
                  return (
                    <tr key={metric}>
                      <td className="name">{METRIC_LABEL[metric]}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{fmtByMetric(metric, actual)}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{fmtByMetric(metric, extraido)}</td>
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

          {tipoEsperado === 'cuadre' && (
            <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 8 }}>
              Si ya habías cargado este mismo cuadre antes (o subes el mismo día dos veces), corrige el valor a mano para no duplicarlo.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn" type="button" onClick={handleAplicar}>Aplicar a la tabla de abajo</button>
            {aplicado && (
              <span style={{ fontSize: 12.5, color: 'var(--green)' }}>
                Aplicado a {sucursalSel} · {MONTH_NAMES_FULL[mesIdx]} {añoSel} — revisa y dale "Guardar cambios" abajo.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ImportarExcel() {
  const { getIdToken } = useAuth();
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleImport() {
    if (!file) { setError('Elige primero un archivo .xlsx'); return; }
    setImporting(true);
    setError('');
    setResult(null);
    try {
      const token = await getIdToken();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import-excel', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al importar');
      setResult(data);
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Importar desde Excel</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        Sube el archivo de control interno (mismo formato de siempre: hojas BARRANQUILLA, CAUCASIA,
        EURO, HEROICA, SINU, LA 5 (si ya existe) y SEMANALES). Los datos que traiga <b>reemplazan</b> lo que ya está
        guardado para esos meses y sucursales — así que si solo quieres corregir un par de valores,
        es más rápido hacerlo en la tabla de abajo.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0] || null)} style={{ fontSize: 12, color: 'var(--text-dim)' }} />
        <button className="btn" onClick={handleImport} disabled={importing || !file}>
          {importing ? 'Importando…' : 'Importar archivo'}
        </button>
      </div>
      {error && <div className="login-error">{error}</div>}
      {result && (
        <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 12 }}>
          Listo: se cargaron {result.monthlyCount} registros mensuales
          ({result.branches.join(', ')}) y {result.weeklyCount} reportes semanales.
        </div>
      )}
    </div>
  );
}

function EditarInner() {
  const { monthly, saveMonthlyMetric } = useData();
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [year, setYear] = useState('2026');
  const [draft, setDraft] = useState(null); // {metric: [12 valores]} mientras se edita
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  function valueFor(metric, m) {
    if (draft && draft[metric]) return draft[metric][m];
    return series(monthly, branch, year, metric)[m];
  }

  function handleChange(metric, m, value) {
    setDraft((prev) => {
      const base = prev || {};
      const arr = base[metric] ? [...base[metric]] : [...series(monthly, branch, year, metric)];
      arr[m] = value === '' ? 0 : parseFloat(value);
      return { ...base, [metric]: arr };
    });
  }

  async function handleSave() {
    if (!draft) { setStatus('No hay cambios que guardar.'); return; }
    setSaving(true);
    try {
      for (const metric of Object.keys(draft)) {
        await saveMonthlyMetric(branch, year, metric, draft[metric]);
      }
      setDraft(null);
      setStatus(`Cambios guardados para ${branch} · ${year}.`);
    } catch (err) {
      setStatus('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 5000);
    }
  }

  // Lo que extrae un PDF de caja se aplica como si lo hubiera tecleado el
  // admin en la tabla de abajo: queda en `draft` sin guardarse hasta que le
  // den "Guardar cambios". Si la sucursal/año de ese PDF no es la que está
  // seleccionada arriba, se cambia el selector y se empieza un draft nuevo
  // (para no mezclar ediciones pendientes de una sucursal con otra).
  function aplicarDesdePdf(suc, añoPdf, mesIdx, valores) {
    const mismoContexto = suc === branch && añoPdf === year;
    setBranch(suc);
    setYear(añoPdf);
    setDraft((prev) => {
      const base = mismoContexto ? (prev || {}) : {};
      const next = { ...base };
      METRICAS_PDF.forEach((metric) => {
        const arr = next[metric] ? [...next[metric]] : [...series(monthly, suc, añoPdf, metric)];
        arr[mesIdx] = valores[metric];
        next[metric] = arr;
      });
      return next;
    });
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Editar datos</h1><p>Corrige un valor o carga el mes que acabas de cerrar — se guarda directo en la base de datos</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={branch} onChange={(e) => { setBranch(e.target.value); setDraft(null); }}>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select>
          <select value={year} onChange={(e) => { setYear(e.target.value); setDraft(null); }}><option value="2026">2026</option><option value="2025">2025</option></select>
        </div>
      </div>

      <div className="readonly-banner">
        Estos cambios se guardan directamente en Firestore y los verá cualquier persona con acceso al panel, en tiempo real.
      </div>

      <ImportarExcel />

      <PanelPdfCaja tipoEsperado="consolidado" branch={branch} year={year} monthly={monthly} onAplicar={aplicarDesdePdf} />
      <PanelPdfCaja tipoEsperado="cuadre" branch={branch} year={year} monthly={monthly} onAplicar={aplicarDesdePdf} />

      <div className="panel">
        <div className="panel-head">
          <h3>Valores mensuales · {branch} · {year}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
            <button className="btn-outline" onClick={() => setDraft(null)}>Descartar cambios</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th style={{ textAlign: 'left' }}>Métrica</th>{MONTH_NAMES.map((m) => <th key={m}>{m}</th>)}</tr></thead>
            <tbody>
              {EDIT_METRICS.map((metric) => (
                <tr key={metric}>
                  <td className="name">{METRIC_LABEL[metric]}</td>
                  {Array.from({ length: 12 }).map((_, m) => (
                    <td key={m}>
                      <input
                        type="number" step="any"
                        value={valueFor(metric, m)}
                        onChange={(e) => handleChange(metric, m, e.target.value)}
                        style={{ width: 88, textAlign: 'right' }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {status && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 10 }}>{status}</div>}
      </div>
    </div>
  );
}

export default function EditarPage() {
  return (
    <RequireAdmin>
      <EditarInner />
    </RequireAdmin>
  );
}
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

const campoLabel = { fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 };

function fechaStr(dia, mes, anio) {
  if (!dia || !mes || !anio) return null;
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`;
}

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

let idCounter = 0;
function nextId() { idCounter += 1; return `pdf_${Date.now()}_${idCounter}`; }

/**
 * Para "cuadre" calcula el valor a aplicar como la suma de lo ya guardado en
 * Firestore más lo extraído de este archivo MÁS lo que ya llevan sumado otros
 * archivos del mismo lote que caigan en la misma sucursal/año/mes — así,
 * subir varios cuadres diarios del mismo mes en un solo lote los acumula a
 * todos en vez de que cada uno pise al anterior. Para "consolidado" el valor
 * extraído ya es el total del periodo, así que reemplaza directo.
 */
function calcularValoresItem(tipoEsperado, monthly, resultadoPdf, suc, an, mi, otrosDelLoteMismoMes) {
  if (tipoEsperado !== 'cuadre') return { ...resultadoPdf.valores };
  const nuevos = {};
  METRICAS_PDF.forEach((m) => {
    const actualGuardado = series(monthly, suc, an, m)[mi] || 0;
    const sumaDelLote = otrosDelLoteMismoMes.reduce((s, it) => s + (it.resultado?.valores[m] || 0), 0);
    nuevos[m] = actualGuardado + sumaDelLote + (resultadoPdf.valores[m] || 0);
  });
  return nuevos;
}

function PanelPdfCaja({ tipoEsperado, branch, year }) {
  const info = TIPO_INFO[tipoEsperado];
  const { getIdToken } = useAuth();
  const { monthly, saveMonthlyMetric } = useData();
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [items, setItems] = useState([]); // { id, file, nombre, estado, error, resultado, sucursalSel, añoSel, mesIdx, valores, colapsado }
  const [extrayendoTodos, setExtrayendoTodos] = useState(false);
  const [guardandoTodo, setGuardandoTodo] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const pendientes = items.filter((it) => it.estado === 'pendiente' || it.estado === 'error');
  const listos = items.filter((it) => it.estado === 'listo');

  function agregarArchivos(fileList) {
    const nuevos = Array.from(fileList || [])
      .filter((f) => f.type === 'application/pdf')
      .map((f) => ({ id: nextId(), file: f, nombre: f.name, estado: 'pendiente', colapsado: false }));
    if (nuevos.length) setItems((prev) => [...prev, ...nuevos]);
    setMensaje('');
  }

  function quitarItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function limpiarTodo() {
    setItems([]);
    setMensaje('');
  }

  function toggleColapsado(id) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, colapsado: !it.colapsado } : it)));
  }

  function actualizarValor(id, metric, value) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, valores: { ...it.valores, [metric]: value } } : it)));
  }

  async function handleExtraerTodos() {
    setExtrayendoTodos(true);
    setMensaje('');
    for (const it of pendientes) {
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, estado: 'leyendo', error: '' } : x)));
      try {
        const token = await getIdToken();
        const formData = new FormData();
        formData.append('file', it.file);
        const res = await fetch('/api/parse-caja-pdf', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo leer el PDF');
        if (data.tipo !== tipoEsperado) {
          throw new Error(`Este PDF parece ser de ${TIPO_INFO[data.tipo]?.nombrePdf || 'otro formato'} — súbelo en el panel de "${TIPO_INFO[data.tipo]?.titulo || info.nombreOtro}".`);
        }
        const suc = data.sucursal && BRANCHES.includes(data.sucursal) ? data.sucursal : branch;
        const an = data.anio || year;
        const mi = data.mes ? data.mes - 1 : 0;
        setItems((prev) => {
          const otrosDelLoteMismoMes = prev.filter((x) => x.id !== it.id && x.resultado && x.sucursalSel === suc && x.añoSel === an && x.mesIdx === mi);
          const valores = calcularValoresItem(tipoEsperado, monthly, data, suc, an, mi, otrosDelLoteMismoMes);
          return prev.map((x) => (x.id === it.id ? { ...x, estado: 'listo', resultado: data, sucursalSel: suc, añoSel: an, mesIdx: mi, valores } : x));
        });
      } catch (err) {
        setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, estado: 'error', error: err.message } : x)));
      }
    }
    setExtrayendoTodos(false);
  }

  async function handleGuardarTodo() {
    if (!listos.length) return;
    setGuardandoTodo(true);
    setMensaje('');
    try {
      for (const it of listos) {
        for (const metric of METRICAS_PDF) {
          const arr = [...series(monthly, it.sucursalSel, it.añoSel, metric)];
          arr[it.mesIdx] = it.valores[metric];
          await saveMonthlyMetric(it.sucursalSel, it.añoSel, metric, arr);
        }
      }
      setMensaje(`Guardado: ${listos.length} archivo${listos.length === 1 ? '' : 's'}.`);
      setItems((prev) => prev.filter((it) => it.estado !== 'listo'));
    } catch (err) {
      setMensaje('Error al guardar: ' + err.message);
    } finally {
      setGuardandoTodo(false);
      setTimeout(() => setMensaje(''), 6000);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>{info.titulo}</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        {info.descripcion} Puedes arrastrar varios PDF a la vez. Revisa los números de cada uno antes de guardar — no se guardan solos.
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); agregarArchivos(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--gold)' : 'var(--border)'}`,
          borderRadius: 10, padding: '26px 16px', textAlign: 'center', cursor: 'pointer',
          background: dragOver ? 'rgba(199,163,57,0.08)' : 'var(--surface-2)',
        }}
      >
        <input
          ref={inputRef} type="file" accept="application/pdf" multiple style={{ display: 'none' }}
          onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ''; }}
        />
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          Arrastra uno o varios PDF aquí, o haz clic para elegirlos{items.length > 0 && ` (${items.length} en la lista)`}
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" type="button" onClick={handleExtraerTodos} disabled={extrayendoTodos || pendientes.length === 0}>
            {extrayendoTodos ? 'Leyendo PDF…' : `Extraer datos (${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'})`}
          </button>
          <button className="btn" type="button" onClick={handleGuardarTodo} disabled={guardandoTodo || listos.length === 0}>
            {guardandoTodo ? 'Guardando…' : `Guardar todo en la base de datos (${listos.length})`}
          </button>
          <button className="btn-outline" type="button" onClick={limpiarTodo}>Quitar todos</button>
        </div>
      )}

      {mensaje && <div style={{ fontSize: 12.5, color: mensaje.startsWith('Error') ? 'var(--red)' : 'var(--green)', marginTop: 10 }}>{mensaje}</div>}

      {items.map((it) => (
        <div key={it.id} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13 }}>📄 <b>{it.nombre}</b></span>
            <span className={`pill ${it.estado === 'listo' ? 'pos' : it.estado === 'error' ? 'neg' : 'neu'}`}>
              {{ pendiente: 'Pendiente', leyendo: 'Leyendo…', listo: 'Listo para revisar', error: 'Error' }[it.estado]}
            </span>
            {it.estado === 'listo' && (
              <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                {it.sucursalSel} · {MONTH_NAMES_FULL[it.mesIdx]} {it.añoSel}
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {it.estado === 'listo' && (
                <button className="btn-outline" type="button" onClick={() => toggleColapsado(it.id)} style={{ padding: '4px 10px', fontSize: 12 }}>
                  {it.colapsado ? 'Ver detalle' : 'Ocultar detalle'}
                </button>
              )}
              <button className="btn-outline" type="button" onClick={() => quitarItem(it.id)} style={{ padding: '4px 10px', fontSize: 12 }}>Quitar</button>
            </div>
          </div>

          {it.estado === 'error' && <div className="login-error" style={{ marginTop: 10 }}>{it.error}</div>}

          {it.estado === 'listo' && !it.colapsado && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 10 }}>
                {it.resultado.codigoDetectado && <> Código detectado: <b>{it.resultado.codigoDetectado}</b></>}
                {(() => {
                  const ini = fechaStr(it.resultado.dia, it.resultado.mes, it.resultado.anio);
                  const fin = fechaStr(it.resultado.diaFin, it.resultado.mesFin, it.resultado.anioFin);
                  if (!ini) return null;
                  return <> · Periodo del PDF: <b>{ini}{fin && fin !== ini ? ` – ${fin}` : ''}</b></>;
                })()}
              </div>

              {it.resultado.multiMes && (
                <div className="login-error" style={{ marginTop: 10 }}>
                  ⚠ Este PDF cubre más de un mes (de {fechaStr(it.resultado.dia, it.resultado.mes, it.resultado.anio)} a {fechaStr(it.resultado.diaFin, it.resultado.mesFin, it.resultado.anioFin)}).
                  El total extraído no corresponde a un solo mes de "Editar datos" — revísalo antes de guardar.
                </div>
              )}

              {!(it.resultado.sucursal && BRANCHES.includes(it.resultado.sucursal)) && (
                <div className="login-error" style={{ marginTop: 10 }}>
                  No se reconoció la sucursal en este PDF — se va a aplicar a <b>{it.sucursalSel}</b> (la sucursal seleccionada arriba de la página).
                </div>
              )}

              <div style={{ overflowX: 'auto', marginTop: 10 }}>
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
                      const actual = series(monthly, it.sucursalSel, it.añoSel, metric)[it.mesIdx] || 0;
                      const extraido = it.resultado.valores[metric];
                      const nuevo = it.valores[metric];
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
                              onChange={(e) => actualizarValor(it.id, metric, parseFloat(e.target.value) || 0)}
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
                  Si ya habías cargado este mismo día antes (en este lote o en otro anterior), corrige el valor a mano para no duplicarlo.
                </div>
              )}
            </>
          )}
        </div>
      ))}
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

      <PanelPdfCaja tipoEsperado="consolidado" branch={branch} year={year} />
      <PanelPdfCaja tipoEsperado="cuadre" branch={branch} year={year} />

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
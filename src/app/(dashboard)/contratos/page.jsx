'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as XLSX from 'xlsx';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { fmtMoney, fmtGr } from '@/lib/dataHelpers';
import { parseContratosBuffer } from '@/lib/contratosParser';
import { computeAggregates } from '@/lib/contratosAggregates';
import { generateContratosReportPdf } from '@/lib/contratosPdf';

const RESUMEN_PATH = ['contratos_resumen', 'actual'];
const LOCK_PATH = ['meta', 'importLock'];
const LOCK_STALE_MS = 20 * 60 * 1000; // una traba más vieja que esto se ignora (proceso que murió sin soltarla)

function fmtFechaHora(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('es-CO');
}

// Estado de la importación, FUERA de React a propósito: el componente se
// desmonta cada vez que se cambia de menú (la pantalla de progreso
// desaparece), pero el proceso en sí no se detiene solo por eso — así que el
// estado vive aquí para poder seguir viéndolo sin importar a qué página del
// panel se navegue mientras corre.
let importSnapshot = { running: false, etapa: null, result: null, error: '', fileName: '' };
const importListeners = new Set();
function setImportSnapshot(patch) {
  importSnapshot = { ...importSnapshot, ...patch };
  importListeners.forEach((fn) => fn());
}
function subscribeImport(fn) {
  importListeners.add(fn);
  return () => importListeners.delete(fn);
}
function getImportSnapshot() {
  return importSnapshot;
}

// Candado en Firestore (no solo en este navegador): evita que dos
// importaciones corran a la vez aunque una la lance un script del servidor y
// la otra la lance alguien desde la pantalla.
async function acquireImportLock(by) {
  const ref = doc(db, ...LOCK_PATH);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;
  if (data?.running && Date.now() - (data.startedAt || 0) < LOCK_STALE_MS) {
    const hace = Math.round((Date.now() - data.startedAt) / 60000);
    throw new Error(`Ya hay una importación en curso (la empezó ${data.by || 'alguien'} hace ${hace} min). Espera a que termine antes de lanzar otra.`);
  }
  await setDoc(ref, { running: true, startedAt: Date.now(), by });
}
async function releaseImportLock() {
  await setDoc(doc(db, ...LOCK_PATH), { running: false, startedAt: Date.now() }, { merge: true });
}

async function runImport(file, onImported, by) {
  if (importSnapshot.running) return; // ya hay una importación en curso en este navegador
  setImportSnapshot({ running: true, etapa: 'leyendo', result: null, error: '', fileName: file.name });
  try {
    await acquireImportLock(by);
    // El archivo se procesa aquí mismo en el navegador (igual que "Editar
    // datos") — así no pasa por ninguna API route y no choca con el límite
    // de subida de Vercel (~4.5MB), que un Excel grande de contratos supera
    // fácilmente.
    const buffer = await file.arrayBuffer();
    const contratos = parseContratosBuffer(buffer);
    if (contratos.length === 0) {
      throw new Error('No se reconoció ningún contrato en el archivo (se esperaba la columna "Contrato Secuencia").');
    }

    // No se guarda una fila por contrato (eso es lo que agotaba la cuota de
    // lecturas/escrituras de Firestore con 100k+ filas cada mes) — se
    // calculan los indicadores aquí mismo y se guarda solo ese resumen, que
    // es lo único que el panel necesita mostrar.
    setImportSnapshot({ etapa: 'calculando' });
    const aggregates = computeAggregates(contratos);

    setImportSnapshot({ etapa: 'guardando' });
    await setDoc(doc(db, ...RESUMEN_PATH), {
      generadoEn: Date.now(),
      archivo: file.name,
      totalContratosArchivo: contratos.length,
      ...aggregates,
    });

    setImportSnapshot({ running: false, result: { count: contratos.length } });
    await releaseImportLock();
    onImported?.();
  } catch (err) {
    setImportSnapshot({ running: false, error: err.message });
    // Si el error fue porque ya había una importación en curso, esa traba es
    // de la OTRA importación — no hay que soltarla, sigue corriendo.
    if (!err.message?.startsWith('Ya hay una importación en curso')) {
      await releaseImportLock().catch(() => {});
    }
  }
}

function ImportarContratos({ onImported }) {
  const { isAdmin, user } = useAuth();
  const [file, setFile] = useState(null);
  const status = useSyncExternalStore(subscribeImport, getImportSnapshot, getImportSnapshot);
  const wasRunning = useRef(status.running);

  useEffect(() => {
    // Si esta pantalla se vuelve a montar (el usuario navegó y volvió) justo
    // cuando una importación termina, refresca igual.
    if (wasRunning.current && !status.running) onImported?.();
    wasRunning.current = status.running;
  }, [status.running, onImported]);

  if (!isAdmin) return null;

  function handleImport() {
    if (!file) return;
    runImport(file, onImported, user?.email || 'navegador');
    setFile(null);
  }

  const etapaLabel = { leyendo: 'Leyendo archivo…', calculando: 'Calculando indicadores…', guardando: 'Guardando…' };

  return (
    <div className="panel">
      <div className="panel-head"><h3>Importar informe de contratos</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        Sube cada mes el "INFORME CONTRATOS" (hoja <b>REPORT CONTRATOS</b>) en Excel o CSV.
        Se calculan los indicadores y <b>reemplazan al informe anterior</b> — no se guarda cada
        contrato por separado, solo los resúmenes que ves abajo. El proceso sigue aunque cambies de
        menú.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => setFile(e.target.files[0] || null)}
          disabled={status.running}
          style={{ fontSize: 12, color: 'var(--text-dim)' }}
        />
        <button className="btn" onClick={handleImport} disabled={status.running || !file}>
          {status.running ? (etapaLabel[status.etapa] || 'Importando…') : 'Reemplazar con este archivo'}
        </button>
      </div>
      {status.running && (
        <div style={{ fontSize: 11.5, color: 'var(--text-dimmer)', marginTop: 8 }}>
          Importando {status.fileName} — puedes seguir navegando el panel, esto no se detiene.
        </div>
      )}
      {status.error && <div className="login-error">{status.error}</div>}
      {status.result && (
        <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 12 }}>
          Listo: se calcularon los indicadores de {status.result.count} contratos.
        </div>
      )}
    </div>
  );
}

export default function ContratosPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rangoCategoria, setRangoCategoria] = useState('todas');

  async function loadResumen() {
    setLoading(true);
    setError('');
    try {
      const snap = await getDoc(doc(db, ...RESUMEN_PATH));
      setData(snap.exists() ? snap.data() : null);
    } catch (err) {
      setError('No se pudo cargar el informe: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadResumen(); }, []);

  function handleDownloadPdf() {
    if (!data) return;
    generateContratosReportPdf(data, { archivo: data.archivo, generadoEn: data.generadoEn });
  }

  function handleDownloadExcel() {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Indicador: 'Contratos', Valor: data.kpis.totalContratos },
      { Indicador: 'Valor contratado', Valor: data.kpis.valorTotal },
      { Indicador: '% Retroventa promedio', Valor: data.kpis.retroProm },
      { Indicador: 'Vencidos', Valor: data.kpis.vencidos },
      { Indicador: 'Por vencer (30d)', Valor: data.kpis.porVencer },
    ]), 'KPIs');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.vencimientosPorPlazo.map((g) => ({
        'Tipo de plazo': g.label, Total: g.total, 'Al día': g.alDia, 'Por vencer (30d)': g.porVencer, Vencidos: g.vencidos,
      }))
    ), 'Por plazo');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.porSociedad.map((s) => ({
        Sociedad: s.sociedad, Contratos: s.contratos, 'Valor total': s.valorTotal,
        'Gramos oro': s.gramosOro, 'Valor oro': s.valorOro, '$/gramo': s.gramosOro ? s.valorOro / s.gramosOro : '',
      }))
    ), 'Por sociedad');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.porSucursal.map((j) => ({
        Sucursal: j.joyeria, Sociedad: j.sociedad, Ciudad: j.ciudad, Contratos: j.contratos,
        'Valor total': j.valorTotal, 'Gramos oro': j.gramosOro, 'Valor oro': j.valorOro,
        '$/gramo': j.gramosOro ? j.valorOro / j.gramosOro : '',
      }))
    ), 'Por sucursal');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.porRangoValorTodas.buckets.map((b) => ({ Rango: b.label, Contratos: b.contratos, Valor: b.valor }))
    ), 'Rango de valor');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.porCategoria.map((c) => ({ Categoría: c.categoria, Contratos: c.count, Valor: c.valor, Gramos: c.gramos }))
    ), 'Por categoría');

    XLSX.writeFile(wb, `informe-contratos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const rango = rangoCategoria === 'oro' ? data?.porRangoValorOro : data?.porRangoValorTodas;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Contratos</h1>
          <p>
            Indicadores del informe de contratos — % de retroventa, vigencia y estado.
            {data ? ` Datos de "${data.archivo}", generado el ${fmtFechaHora(data.generadoEn)}.` : ''}
          </p>
        </div>
        <button className="btn-outline" type="button" onClick={loadResumen} disabled={loading}>
          {loading ? 'Cargando…' : '↻ Actualizar'}
        </button>
      </div>

      {error && <div className="login-error">{error}</div>}

      <ImportarContratos onImported={loadResumen} />

      {loading ? (
        <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>
      ) : !data ? (
        <div className="empty-note">Todavía no hay ningún informe importado. Súbelo arriba.</div>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi"><div className="label">Contratos</div><div className="value">{data.kpis.totalContratos.toLocaleString('es-CO')}</div></div>
            <div className="kpi"><div className="label">Valor contratado</div><div className="value">{fmtMoney(data.kpis.valorTotal)}</div></div>
            <div className="kpi"><div className="label">% Retroventa promedio</div><div className="value">{data.kpis.retroProm.toFixed(1)}%</div></div>
            <div className="kpi">
              <div className="label">Vencidos / por vencer (30d)</div>
              <div className="value" style={{ color: data.kpis.vencidos > 0 ? 'var(--red)' : undefined }}>
                {data.kpis.vencidos.toLocaleString('es-CO')} / {data.kpis.porVencer.toLocaleString('es-CO')}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Informe descargable</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn-outline" type="button" onClick={handleDownloadPdf}>⭳ Descargar PDF</button>
                <button className="btn-outline" type="button" onClick={handleDownloadExcel}>⭳ Descargar Excel</button>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
              El PDF trae los mismos indicadores de esta pantalla listos para imprimir o enviar; el
              Excel trae cada resumen en su propia hoja (KPIs, por plazo, por sociedad, por sucursal,
              rango de valor, por categoría).
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Vencidos y por vencer por tipo de plazo</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Tipo de plazo</th>
                    <th>Total</th><th>Al día</th><th>Por vencer (30d)</th><th>Vencidos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vencimientosPorPlazo.map((g) => (
                    <tr key={g.label}>
                      <td className="name">{g.label}</td>
                      <td>{g.total}</td>
                      <td>{g.alDia}</td>
                      <td style={{ color: g.porVencer > 0 ? 'var(--gold-light)' : undefined, fontWeight: g.porVencer > 0 ? 700 : 400 }}>{g.porVencer}</td>
                      <td style={{ color: g.vencidos > 0 ? 'var(--red)' : undefined, fontWeight: g.vencidos > 0 ? 700 : 400 }}>{g.vencidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Resumen por sociedad</h3></div>
            <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Sociedad</th>
                    <th>Contratos</th><th>Valor total</th><th>Gramos oro</th><th>Valor oro</th><th>$/gramo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porSociedad.map((s) => (
                    <tr key={s.sociedad}>
                      <td className="name">{s.sociedad}</td>
                      <td>{s.contratos}</td>
                      <td>{fmtMoney(s.valorTotal)}</td>
                      <td>{fmtGr(s.gramosOro)}</td>
                      <td>{fmtMoney(s.valorOro)}</td>
                      <td>{s.gramosOro ? fmtMoney(s.valorOro / s.gramosOro) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Resumen por sucursal</h3>
              <span className="hint">{data.porSucursal.length} sucursales</span>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Sucursal</th>
                    <th style={{ textAlign: 'left' }}>Sociedad</th>
                    <th>Ciudad</th><th>Contratos</th><th>Valor total</th><th>Gramos oro</th><th>Valor oro</th><th>$/gramo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porSucursal.map((j) => (
                    <tr key={j.joyeria}>
                      <td className="name">{j.joyeria}</td>
                      <td>{j.sociedad}</td>
                      <td>{j.ciudad}</td>
                      <td>{j.contratos}</td>
                      <td>{fmtMoney(j.valorTotal)}</td>
                      <td>{fmtGr(j.gramosOro)}</td>
                      <td>{fmtMoney(j.valorOro)}</td>
                      <td>{j.gramosOro ? fmtMoney(j.valorOro / j.gramosOro) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Contratos por rango de valor</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={rangoCategoria === 'todas' ? 'btn' : 'btn-outline'} type="button" onClick={() => setRangoCategoria('todas')}>Todas las categorías</button>
                <button className={rangoCategoria === 'oro' ? 'btn' : 'btn-outline'} type="button" onClick={() => setRangoCategoria('oro')}>Solo oro</button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Rango</th>
                    <th>Contratos</th><th>% contratos</th>
                    {rangoCategoria === 'oro' && <th>Gramos</th>}
                    <th>Valor</th><th>% valor</th>
                  </tr>
                </thead>
                <tbody>
                  {rango.buckets.map((b) => (
                    <tr key={b.label}>
                      <td className="name">{b.label}</td>
                      <td>{b.contratos}</td>
                      <td>{(rango.totalContratos ? (b.contratos / rango.totalContratos) * 100 : 0).toFixed(1)}%</td>
                      {rangoCategoria === 'oro' && <td>{fmtGr(b.gramos)}</td>}
                      <td>{fmtMoney(b.valor)}</td>
                      <td>{(rango.totalValor ? (b.valor / rango.totalValor) * 100 : 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700 }}>
                    <td className="name">Total general</td>
                    <td>{rango.totalContratos}</td>
                    <td>100.0%</td>
                    {rangoCategoria === 'oro' && <td>{fmtGr(rango.totalGramos)}</td>}
                    <td>{fmtMoney(rango.totalValor)}</td>
                    <td>100.0%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Resumen por estado</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr><th style={{ textAlign: 'left' }}>Estado</th><th>Contratos</th><th>Valor</th></tr>
                </thead>
                <tbody>
                  {data.porEstado.map((e) => (
                    <tr key={e.estado}>
                      <td className="name">{e.estado}</td>
                      <td>{e.count}</td>
                      <td>{fmtMoney(e.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Resumen por categoría</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr><th style={{ textAlign: 'left' }}>Categoría</th><th>Contratos</th><th>Valor</th><th>Gramos</th></tr>
                </thead>
                <tbody>
                  {data.porCategoria.map((c) => (
                    <tr key={c.categoria}>
                      <td className="name">{c.categoria}</td>
                      <td>{c.count}</td>
                      <td>{fmtMoney(c.valor)}</td>
                      <td>{fmtGr(c.gramos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { fmtMoney, fmtPct, fmtGr } from '@/lib/dataHelpers';
import { parseContratosBuffer } from '@/lib/contratosParser';

const PAGE_SIZE = 50;

function fmtFecha(s) {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const rest = s.slice(10).trim();
  return `${m[3]}/${m[2]}/${m[1]}${rest ? ' ' + rest : ''}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((d - hoy) / (1000 * 60 * 60 * 24));
}

function uniqueSorted(list) {
  return [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

// "Joyeria" trae "<código>-<sociedad>" (ej. "013-EFECTIVA", "498-CAUCASIA");
// la sociedad es el nombre después del guion, sin el código.
function sociedadOf(joyeria) {
  const s = String(joyeria || '').replace(/^\d+-\s*/, '').trim();
  return s || joyeria || '';
}

// Prefiere el nombre real de "Sociedad" (del informe de contratos); si el
// contrato no lo trae (se cargó de un archivo viejo que no tenía esa
// columna), cae al nombre derivado de la Joyería.
function sociedadReal(c) {
  return c.sociedad || sociedadOf(c.joyeria);
}

// Mismos rangos de valor que trae el informe de contratos (hoja "CATEGORIAS").
const RANGOS_VALOR = [
  { desde: 0, hasta: 999999, label: 'Hasta $999.999' },
  { desde: 1000000, hasta: 1999999, label: '$1.000.000 – $1.999.999' },
  { desde: 2000000, hasta: 2999999, label: '$2.000.000 – $2.999.999' },
  { desde: 3000000, hasta: 4999999, label: '$3.000.000 – $4.999.999' },
  { desde: 5000000, hasta: 9999999, label: '$5.000.000 – $9.999.999' },
  { desde: 10000000, hasta: 29999999, label: '$10.000.000 – $29.999.999' },
  { desde: 30000000, hasta: Infinity, label: '$30.000.000 o más' },
];

// "Contrato Termino" usa la misma columna para dos unidades distintas: los
// contratos de venta directa están a 15 días (no 15 meses), y el resto de
// valores (1, 3, 4, 6...) sí son meses. Se distingue por el valor exacto 15.
function tipoPlazo(termino) {
  if (termino === 15) return 'Venta directa (15 días)';
  return `A término (${termino} ${termino === 1 ? 'mes' : 'meses'})`;
}
const ORDEN_PLAZO = [15, 1, 3, 4, 6];
function ordenPlazo(termino) {
  const i = ORDEN_PLAZO.indexOf(termino);
  return i === -1 ? ORDEN_PLAZO.length + termino : i;
}

const WRITE_CHUNK = 450; // Firestore permite máximo 500 operaciones por batch.

function ImportarContratos({ onImported }) {
  const { isAdmin } = useAuth();
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const cancelRef = useRef(false);

  if (!isAdmin) return null;

  function handleCancel() {
    cancelRef.current = true;
    setCancelling(true);
  }

  async function handleImport() {
    if (!file) { setError('Elige primero un archivo .xlsx, .xls o .csv'); return; }
    cancelRef.current = false;
    setCancelling(false);
    setImporting(true);
    setError('');
    setResult(null);
    setProgress(null);
    try {
      // El archivo se procesa aquí mismo en el navegador y se escribe
      // directo a Firestore (igual que "Editar datos") — así no pasa por
      // ninguna API route y no choca con el límite de tamaño de subida de
      // Vercel para funciones serverless (~4.5MB), que un Excel grande de
      // contratos supera fácilmente.
      const buffer = await file.arrayBuffer();
      const contratos = parseContratosBuffer(buffer);
      if (contratos.length === 0) {
        throw new Error('No se reconoció ningún contrato en el archivo (se esperaba la columna "Contrato Secuencia").');
      }

      // Cada importación REEMPLAZA toda la cartera anterior (se sube un
      // informe distinto cada mes, no es un acumulado histórico): primero se
      // borra todo lo que había.
      setProgress({ etapa: 'borrando', done: 0, total: 0 });
      const existentes = await getDocs(collection(db, 'contratos'));
      const refsABorrar = existentes.docs.map((d) => d.ref);
      let borrados = 0;
      for (let i = 0; i < refsABorrar.length; i += WRITE_CHUNK) {
        if (cancelRef.current) {
          setResult({ cancelado: true, borrados, count: 0 });
          onImported?.();
          return;
        }
        const slice = refsABorrar.slice(i, i + WRITE_CHUNK);
        const batch = writeBatch(db);
        for (const ref of slice) batch.delete(ref);
        await batch.commit();
        borrados += slice.length;
        setProgress({ etapa: 'borrando', done: borrados, total: refsABorrar.length });
      }

      let done = 0;
      for (let i = 0; i < contratos.length; i += WRITE_CHUNK) {
        if (cancelRef.current) {
          setResult({ cancelado: true, borrados: refsABorrar.length, count: done });
          onImported?.();
          return;
        }
        const slice = contratos.slice(i, i + WRITE_CHUNK);
        const batch = writeBatch(db);
        for (const contrato of slice) {
          // ID autogenerado: dos filas del archivo pueden traer la misma
          // Contrato Secuencia repetida (no es un identificador único de
          // verdad) y como cada importación reemplaza todo, no hace falta
          // una clave estable — así no se pierde ninguna fila por chocar.
          batch.set(doc(collection(db, 'contratos')), contrato);
        }
        await batch.commit();
        done += slice.length;
        setProgress({ etapa: 'cargando', done, total: contratos.length });
      }

      setResult({ count: contratos.length, borrados: refsABorrar.length });
      setFile(null);
      onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Importar informe de contratos</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        Sube cada mes el "INFORME CONTRATOS" (hoja <b>REPORT CONTRATOS</b>) en Excel o CSV.
        <b> Esto reemplaza toda la cartera que había antes</b> — no se acumula entre meses, cada
        importación deja solo lo que trae el archivo de ese mes.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files[0] || null)} style={{ fontSize: 12, color: 'var(--text-dim)' }} />
        <button className="btn" onClick={handleImport} disabled={importing || !file}>
          {importing
            ? !progress
              ? 'Leyendo archivo…'
              : progress.etapa === 'borrando'
                ? `Borrando cartera anterior… (${progress.done}/${progress.total})`
                : `Cargando… (${progress.done}/${progress.total})`
            : 'Reemplazar con este archivo'}
        </button>
        {importing && progress && (
          <button className="btn-outline" type="button" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelando…' : 'Cancelar'}
          </button>
        )}
      </div>
      {error && <div className="login-error">{error}</div>}
      {result && result.cancelado && (
        <div style={{ fontSize: 12.5, color: 'var(--gold-light)', marginTop: 12 }}>
          Cancelado: quedó a medias (se borraron {result.borrados} y se alcanzaron a cargar {result.count}).
          La cartera no está completa hasta que vuelvas a importar el archivo sin cancelar.
        </div>
      )}
      {result && !result.cancelado && (
        <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 12 }}>
          Listo: se borraron {result.borrados} contratos anteriores y se cargaron {result.count} nuevos.
        </div>
      )}
    </div>
  );
}

export default function ContratosPage() {
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const [fCiudad, setFCiudad] = useState('__ALL__');
  const [fZona, setFZona] = useState('__ALL__');
  const [fSociedad, setFSociedad] = useState('__ALL__');
  const [fEstado, setFEstado] = useState('__ALL__');
  const [fCategoria, setFCategoria] = useState('__ALL__');
  const [fRetroMin, setFRetroMin] = useState('');
  const [fRetroMax, setFRetroMax] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [fBusqueda, setFBusqueda] = useState('');

  async function loadContratos() {
    setLoading(true);
    setError('');
    try {
      const snap = await getDocs(collection(db, 'contratos'));
      setContratos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError('No se pudieron cargar los contratos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadContratos(); }, []);

  const ciudades = useMemo(() => uniqueSorted(contratos.map((c) => c.ciudad)), [contratos]);
  const zonas = useMemo(() => uniqueSorted(contratos.map((c) => c.zona)), [contratos]);
  const sociedades = useMemo(() => uniqueSorted(contratos.map((c) => sociedadOf(c.joyeria))), [contratos]);
  const estados = useMemo(() => uniqueSorted(contratos.map((c) => c.contratoEstado)), [contratos]);
  const categorias = useMemo(() => uniqueSorted(contratos.map((c) => c.contratoCategoria)), [contratos]);

  const filtrados = useMemo(() => {
    const retroMin = fRetroMin === '' ? -Infinity : parseFloat(fRetroMin);
    const retroMax = fRetroMax === '' ? Infinity : parseFloat(fRetroMax);
    const busq = fBusqueda.trim().toLowerCase();
    return contratos.filter((c) => {
      if (fCiudad !== '__ALL__' && c.ciudad !== fCiudad) return false;
      if (fZona !== '__ALL__' && c.zona !== fZona) return false;
      if (fSociedad !== '__ALL__' && sociedadOf(c.joyeria) !== fSociedad) return false;
      if (fEstado !== '__ALL__' && c.contratoEstado !== fEstado) return false;
      if (fCategoria !== '__ALL__' && c.contratoCategoria !== fCategoria) return false;
      if ((c.porcentajeRetroventa || 0) < retroMin || (c.porcentajeRetroventa || 0) > retroMax) return false;
      if (fDesde && (!c.fechaInicio || c.fechaInicio.slice(0, 10) < fDesde)) return false;
      if (fHasta && (!c.fechaInicio || c.fechaInicio.slice(0, 10) > fHasta)) return false;
      if (busq && !`${c.cliente} ${c.documentoCliente} ${c.contratoSecuencia}`.toLowerCase().includes(busq)) return false;
      return true;
    });
  }, [contratos, fCiudad, fZona, fSociedad, fEstado, fCategoria, fRetroMin, fRetroMax, fDesde, fHasta, fBusqueda]);

  const kpis = useMemo(() => {
    const total = filtrados.length;
    const valorTotal = filtrados.reduce((s, c) => s + (c.contratoValor || 0), 0);
    const retroProm = total ? filtrados.reduce((s, c) => s + (c.porcentajeRetroventa || 0), 0) / total : 0;
    const vencidos = filtrados.filter((c) => { const d = daysUntil(c.fechaTerminacion); return d !== null && d < 0; }).length;
    const porVencer = filtrados.filter((c) => { const d = daysUntil(c.fechaTerminacion); return d !== null && d >= 0 && d <= 30; }).length;
    return { total, valorTotal, retroProm, vencidos, porVencer };
  }, [filtrados]);

  const vencimientosPorPlazo = useMemo(() => {
    const grupos = {};
    for (const c of filtrados) {
      const termino = c.contratoTermino;
      const key = tipoPlazo(termino);
      if (!grupos[key]) grupos[key] = { label: key, termino, total: 0, vencidos: 0, porVencer: 0, alDia: 0 };
      const g = grupos[key];
      g.total++;
      const d = daysUntil(c.fechaTerminacion);
      if (d !== null && d < 0) g.vencidos++;
      else if (d !== null && d <= 30) g.porVencer++;
      else g.alDia++;
    }
    return Object.values(grupos).sort((a, b) => ordenPlazo(a.termino) - ordenPlazo(b.termino));
  }, [filtrados]);

  const resumenSociedad = useMemo(() => {
    const grupos = {};
    for (const c of filtrados) {
      const key = sociedadReal(c) || '(sin sociedad)';
      if (!grupos[key]) grupos[key] = { sociedad: key, contratos: 0, valorTotal: 0, gramosOro: 0, valorOro: 0 };
      const g = grupos[key];
      g.contratos++;
      g.valorTotal += c.contratoValor || 0;
      if (c.contratoCategoria === 'ORO') {
        g.gramosOro += c.contratoGramosEstimados || 0;
        g.valorOro += c.contratoValor || 0;
      }
    }
    return Object.values(grupos).sort((a, b) => b.valorTotal - a.valorTotal);
  }, [filtrados]);

  const resumenJoyeria = useMemo(() => {
    const grupos = {};
    for (const c of filtrados) {
      const key = c.joyeria || '(sin joyería)';
      if (!grupos[key]) grupos[key] = { joyeria: key, sociedad: sociedadReal(c), ciudad: c.ciudad, contratos: 0, valorTotal: 0, gramosOro: 0, valorOro: 0 };
      const g = grupos[key];
      g.contratos++;
      g.valorTotal += c.contratoValor || 0;
      if (c.contratoCategoria === 'ORO') {
        g.gramosOro += c.contratoGramosEstimados || 0;
        g.valorOro += c.contratoValor || 0;
      }
    }
    return Object.values(grupos).sort((a, b) => b.valorTotal - a.valorTotal);
  }, [filtrados]);

  const [rangoCategoria, setRangoCategoria] = useState('todas');

  const resumenRangoValor = useMemo(() => {
    const base = rangoCategoria === 'oro' ? filtrados.filter((c) => c.contratoCategoria === 'ORO') : filtrados;
    const totalContratos = base.length;
    const totalValor = base.reduce((s, c) => s + (c.contratoValor || 0), 0);
    const totalGramos = base.reduce((s, c) => s + (c.contratoGramosEstimados || 0), 0);
    const buckets = RANGOS_VALOR.map((r) => ({ ...r, contratos: 0, valor: 0, gramos: 0 }));
    for (const c of base) {
      const v = c.contratoValor || 0;
      const b = buckets.find((x) => v >= x.desde && v <= x.hasta) || buckets[buckets.length - 1];
      b.contratos++;
      b.valor += v;
      b.gramos += c.contratoGramosEstimados || 0;
    }
    return { buckets, totalContratos, totalValor, totalGramos };
  }, [filtrados, rangoCategoria]);

  const pageCount = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const pageItems = filtrados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  function limpiarFiltros() {
    setFCiudad('__ALL__'); setFZona('__ALL__'); setFSociedad('__ALL__'); setFEstado('__ALL__'); setFCategoria('__ALL__');
    setFRetroMin(''); setFRetroMax(''); setFDesde(''); setFHasta(''); setFBusqueda('');
    setPage(1);
  }

  function handleExportExcel() {
    const rows = filtrados.map((c) => ({
      'Cod Joyería': c.codJoyeria, Departamento: c.departamento, Ciudad: c.ciudad, Zona: c.zona,
      'Fecha Inicio': c.fechaInicio, '% Retroventa': c.porcentajeRetroventa, Categoría: c.contratoCategoria,
      Secuencia: c.contratoSecuencia, Joyería: c.joyeria, Sociedad: sociedadOf(c.joyeria), 'Fecha Terminación': c.fechaTerminacion,
      'Gramos Estimados': c.contratoGramosEstimados, 'Gramos Totales': c.contratoGramosTotales,
      Valor: c.contratoValor, 'Valor Mes': c.contratoValorMes, 'Término (meses)': c.contratoTermino,
      'Meses Adeudados': c.mesesAdeudados, 'Documento Cliente': c.documentoCliente, Cliente: c.cliente,
      'Fecha Retroventa': c.fechaRetroventa, 'Fecha Resolución': c.fechaResolucion, 'Creado Por': c.creadoPor,
      Estado: c.contratoEstado, Motivo: c.contratoMotivo, Teléfono: c.clienteTelefono, 'Días Gracia': c.diasGracia,
      Dirección: c.clienteDireccion, 'Fecha Operación': c.fechaOperacion, 'Meses Pagados': c.mesesPagados,
      'Valor Retroventa': c.valorRetroventa,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Contratos');
    XLSX.writeFile(wb, `contratos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Contratos</h1><p>Contratos de préstamo sobre oro — % de retroventa, vigencia y estado</p></div>
        <button className="btn-outline" type="button" onClick={loadContratos} disabled={loading}>
          {loading ? 'Cargando…' : '↻ Actualizar'}
        </button>
      </div>

      {error && <div className="login-error">{error}</div>}

      <ImportarContratos onImported={loadContratos} />

      {loading ? (
        <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>
      ) : contratos.length === 0 ? (
        <div className="empty-note">Todavía no hay contratos cargados. Impórtalos arriba.</div>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi"><div className="label">Contratos (filtro actual)</div><div className="value">{kpis.total}</div></div>
            <div className="kpi"><div className="label">Valor contratado</div><div className="value">{fmtMoney(kpis.valorTotal)}</div></div>
            <div className="kpi"><div className="label">% Retroventa promedio</div><div className="value">{fmtPct(kpis.retroProm).replace('+', '')}</div></div>
            <div className="kpi">
              <div className="label">Vencidos / por vencer (30d)</div>
              <div className="value" style={{ color: kpis.vencidos > 0 ? 'var(--red)' : undefined }}>{kpis.vencidos} / {kpis.porVencer}</div>
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
                  {vencimientosPorPlazo.map((g) => (
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
                  {resumenSociedad.map((s) => (
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
              <span className="hint">{resumenJoyeria.length} sucursales</span>
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
                  {resumenJoyeria.map((j) => (
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
                  {resumenRangoValor.buckets.map((b) => (
                    <tr key={b.label}>
                      <td className="name">{b.label}</td>
                      <td>{b.contratos}</td>
                      <td>{fmtPct(resumenRangoValor.totalContratos ? (b.contratos / resumenRangoValor.totalContratos) * 100 : 0).replace('+', '')}</td>
                      {rangoCategoria === 'oro' && <td>{fmtGr(b.gramos)}</td>}
                      <td>{fmtMoney(b.valor)}</td>
                      <td>{fmtPct(resumenRangoValor.totalValor ? (b.valor / resumenRangoValor.totalValor) * 100 : 0).replace('+', '')}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700 }}>
                    <td className="name">Total general</td>
                    <td>{resumenRangoValor.totalContratos}</td>
                    <td>100.0%</td>
                    {rangoCategoria === 'oro' && <td>{fmtGr(resumenRangoValor.totalGramos)}</td>}
                    <td>{fmtMoney(resumenRangoValor.totalValor)}</td>
                    <td>100.0%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Filtros</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn-outline" type="button" onClick={limpiarFiltros}>Limpiar filtros</button>
                <button className="btn-outline" type="button" onClick={handleExportExcel} disabled={filtrados.length === 0}>⭳ Descargar Excel</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Ciudad</div>
                <select value={fCiudad} onChange={(e) => { setFCiudad(e.target.value); setPage(1); }}>
                  <option value="__ALL__">Todas</option>
                  {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Zona</div>
                <select value={fZona} onChange={(e) => { setFZona(e.target.value); setPage(1); }}>
                  <option value="__ALL__">Todas</option>
                  {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Sociedad</div>
                <select value={fSociedad} onChange={(e) => { setFSociedad(e.target.value); setPage(1); }}>
                  <option value="__ALL__">Todas</option>
                  {sociedades.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Categoría</div>
                <select value={fCategoria} onChange={(e) => { setFCategoria(e.target.value); setPage(1); }}>
                  <option value="__ALL__">Todas</option>
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Estado</div>
                <select value={fEstado} onChange={(e) => { setFEstado(e.target.value); setPage(1); }}>
                  <option value="__ALL__">Todos</option>
                  {estados.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>% Retroventa mín.</div>
                <input type="number" step="any" value={fRetroMin} onChange={(e) => { setFRetroMin(e.target.value); setPage(1); }} style={{ width: 90 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>% Retroventa máx.</div>
                <input type="number" step="any" value={fRetroMax} onChange={(e) => { setFRetroMax(e.target.value); setPage(1); }} style={{ width: 90 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Inicio desde</div>
                <input type="date" value={fDesde} onChange={(e) => { setFDesde(e.target.value); setPage(1); }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Inicio hasta</div>
                <input type="date" value={fHasta} onChange={(e) => { setFHasta(e.target.value); setPage(1); }} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Buscar cliente / documento / secuencia</div>
                <input type="text" value={fBusqueda} onChange={(e) => { setFBusqueda(e.target.value); setPage(1); }} style={{ width: '100%' }} />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Listado de contratos</h3>
              <span className="hint">{filtrados.length} de {contratos.length} · página {pageSafe} de {pageCount}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Cliente</th>
                    <th>Ciudad</th><th>Zona</th><th>Sociedad</th><th>Categoría</th><th>% Retroventa</th>
                    <th>Fecha inicio</th><th>Fecha terminación</th><th>Valor</th><th>Meses adeud.</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => {
                    const d = daysUntil(c.fechaTerminacion);
                    const vencido = d !== null && d < 0;
                    const porVencer = d !== null && d >= 0 && d <= 30;
                    return (
                      <tr key={c.id}>
                        <td className="name">{c.cliente || '—'}</td>
                        <td>{c.ciudad}</td><td>{c.zona}</td><td>{sociedadOf(c.joyeria)}</td><td>{c.contratoCategoria}</td>
                        <td>{fmtPct(c.porcentajeRetroventa).replace('+', '')}</td>
                        <td>{fmtFecha(c.fechaInicio)}</td>
                        <td style={{ color: vencido ? 'var(--red)' : porVencer ? 'var(--gold-light)' : undefined, fontWeight: vencido || porVencer ? 700 : 400 }}>
                          {fmtFecha(c.fechaTerminacion)}
                        </td>
                        <td>{fmtMoney(c.contratoValor)}</td>
                        <td>{c.mesesAdeudados || 0}</td>
                        <td>{c.contratoEstado || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, alignItems: 'center' }}>
                <button className="btn-outline" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1}>← Anterior</button>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{pageSafe} / {pageCount}</span>
                <button className="btn-outline" type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={pageSafe >= pageCount}>Siguiente →</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

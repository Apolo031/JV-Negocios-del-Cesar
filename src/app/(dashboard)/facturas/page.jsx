'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { fmtMoney } from '@/lib/dataHelpers';
import { parseFacturasBuffer, slugifyId } from '@/lib/facturasParser';

const PAGE_SIZE = 50;

function fmtFecha(s) {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const rest = s.slice(10).trim();
  return `${m[3]}/${m[2]}/${m[1]}${rest ? ' ' + rest : ''}`;
}

function uniqueSorted(list) {
  return [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

// "Joyeria" trae "<código>-<sociedad>" (ej. "049-DENARIOS"); la sociedad es
// el nombre después del guion, sin el código. Mismo criterio que Contratos.
function sociedadOf(joyeria) {
  const s = String(joyeria || '').replace(/^\d+-\s*/, '').trim();
  return s || joyeria || '';
}

const WRITE_CHUNK = 450; // Firestore permite máximo 500 operaciones por batch.

function ImportarFacturas({ onImported }) {
  const { isAdmin } = useAuth();
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  if (!isAdmin) return null;

  async function handleImport() {
    if (!file) { setError('Elige primero un archivo .xlsx, .xls o .csv'); return; }
    setImporting(true);
    setError('');
    setResult(null);
    setProgress(null);
    try {
      // Igual que Contratos: se procesa en el navegador y se escribe directo
      // a Firestore, sin pasar por ninguna API route (el archivo puede
      // superar fácilmente el límite de ~4.5MB de las funciones de Vercel).
      const buffer = await file.arrayBuffer();
      const facturas = parseFacturasBuffer(buffer);
      if (facturas.length === 0) {
        throw new Error('No se reconoció ninguna factura en el archivo (se esperaba la columna "Secuencia Factura").');
      }

      let done = 0;
      for (let i = 0; i < facturas.length; i += WRITE_CHUNK) {
        const slice = facturas.slice(i, i + WRITE_CHUNK);
        const batch = writeBatch(db);
        for (const factura of slice) {
          batch.set(doc(db, 'facturas', slugifyId(factura.secuenciaFactura)), factura);
        }
        await batch.commit();
        done += slice.length;
        setProgress({ done, total: facturas.length });
      }

      setResult({ count: facturas.length });
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
      <div className="panel-head"><h3>Importar facturas (R+R)</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        Sube el archivo de retiros y renovaciones (Excel o CSV) con las columnas de siempre: Joyería,
        Secuencia Factura, Operación, Secuencia Contrato, Fecha Factura, Valor Total, etc. Cada factura se
        identifica por su <b>Secuencia Factura</b> — si ya existe, se actualiza con lo nuevo. El campo
        <b> Secuencia Contrato</b> es el que enlaza cada factura con su contrato en el módulo de Contratos.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files[0] || null)} style={{ fontSize: 12, color: 'var(--text-dim)' }} />
        <button className="btn" onClick={handleImport} disabled={importing || !file}>
          {importing ? (progress ? `Importando… (${progress.done}/${progress.total})` : 'Leyendo archivo…') : 'Importar archivo'}
        </button>
      </div>
      {error && <div className="login-error">{error}</div>}
      {result && <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 12 }}>Listo: se cargaron {result.count} facturas.</div>}
    </div>
  );
}

export default function FacturasPage() {
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const [fSociedad, setFSociedad] = useState('__ALL__');
  const [fOperacion, setFOperacion] = useState('__ALL__');
  const [fEstado, setFEstado] = useState('__ALL__');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [fBusqueda, setFBusqueda] = useState('');

  async function loadFacturas() {
    setLoading(true);
    setError('');
    try {
      const snap = await getDocs(collection(db, 'facturas'));
      setFacturas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError('No se pudieron cargar las facturas: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadFacturas(); }, []);

  const sociedades = useMemo(() => uniqueSorted(facturas.map((f) => sociedadOf(f.joyeria))), [facturas]);
  const operaciones = useMemo(() => uniqueSorted(facturas.map((f) => f.operacion)), [facturas]);
  const estados = useMemo(() => uniqueSorted(facturas.map((f) => f.estado)), [facturas]);

  const filtrados = useMemo(() => {
    const busq = fBusqueda.trim().toLowerCase();
    return facturas.filter((f) => {
      if (fSociedad !== '__ALL__' && sociedadOf(f.joyeria) !== fSociedad) return false;
      if (fOperacion !== '__ALL__' && f.operacion !== fOperacion) return false;
      if (fEstado !== '__ALL__' && f.estado !== fEstado) return false;
      if (fDesde && (!f.fechaFactura || f.fechaFactura.slice(0, 10) < fDesde)) return false;
      if (fHasta && (!f.fechaFactura || f.fechaFactura.slice(0, 10) > fHasta)) return false;
      if (busq && !`${f.clienteNombre} ${f.clienteDocumento} ${f.secuenciaFactura} ${f.secuenciaContrato}`.toLowerCase().includes(busq)) return false;
      return true;
    });
  }, [facturas, fSociedad, fOperacion, fEstado, fDesde, fHasta, fBusqueda]);

  const kpis = useMemo(() => {
    const total = filtrados.length;
    const valorTotal = filtrados.reduce((s, f) => s + (f.valorTotal || 0), 0);
    const valorPagado = filtrados.reduce((s, f) => s + (f.valorPagado || 0), 0);
    const prorrogas = filtrados.filter((f) => f.operacion === 'Factura de venta prorroga').length;
    const retroventas = filtrados.filter((f) => f.operacion === 'Factura de venta retroventa').length;
    return { total, valorTotal, valorPagado, prorrogas, retroventas };
  }, [filtrados]);

  const pageCount = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const pageItems = filtrados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  function limpiarFiltros() {
    setFSociedad('__ALL__'); setFOperacion('__ALL__'); setFEstado('__ALL__');
    setFDesde(''); setFHasta(''); setFBusqueda('');
    setPage(1);
  }

  function handleExportExcel() {
    const rows = filtrados.map((f) => ({
      Joyería: f.joyeria, 'Código Joyería': f.codigoJoyeria, 'Secuencia Factura': f.secuenciaFactura,
      Operación: f.operacion, 'Secuencia Operación': f.secuenciaOperacion, 'Secuencia Contrato': f.secuenciaContrato,
      Usuario: f.usuario, 'Fecha Factura': f.fechaFactura, 'Documento Cliente': f.clienteDocumento,
      Cliente: f.clienteNombre, 'Gramos': f.facturaGramos, Subtotal: f.subtotal, Descuento: f.descuento,
      'Subtotal c/Descuento': f.subtotalConDescuento, Impuestos: f.impuestosValor, 'Valor Total': f.valorTotal,
      Retenciones: f.retencionesValor, 'Valor Pagado': f.valorPagado, 'Cant. Productos': f.cantidadProductos,
      Estado: f.estado, 'Estado Fact. Electrónica': f.estadoFacturacionElectronica, Teléfono: f.clienteTelefono,
      'Fecha Operación': f.fechaOperacion,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Facturas');
    XLSX.writeFile(wb, `facturas_rr_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Facturas (R+R)</h1><p>Retiros y renovaciones de contratos — enlazadas por Secuencia Contrato</p></div>
        <button className="btn-outline" type="button" onClick={loadFacturas} disabled={loading}>
          {loading ? 'Cargando…' : '↻ Actualizar'}
        </button>
      </div>

      {error && <div className="login-error">{error}</div>}

      <ImportarFacturas onImported={loadFacturas} />

      {loading ? (
        <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>
      ) : facturas.length === 0 ? (
        <div className="empty-note">Todavía no hay facturas cargadas. Impórtalas arriba.</div>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi"><div className="label">Facturas (filtro actual)</div><div className="value">{kpis.total}</div></div>
            <div className="kpi"><div className="label">Valor total</div><div className="value">{fmtMoney(kpis.valorTotal)}</div></div>
            <div className="kpi"><div className="label">Valor pagado</div><div className="value">{fmtMoney(kpis.valorPagado)}</div></div>
            <div className="kpi"><div className="label">Prórrogas / Retroventas</div><div className="value">{kpis.prorrogas} / {kpis.retroventas}</div></div>
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
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Sociedad</div>
                <select value={fSociedad} onChange={(e) => { setFSociedad(e.target.value); setPage(1); }}>
                  <option value="__ALL__">Todas</option>
                  {sociedades.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Operación</div>
                <select value={fOperacion} onChange={(e) => { setFOperacion(e.target.value); setPage(1); }}>
                  <option value="__ALL__">Todas</option>
                  {operaciones.map((o) => <option key={o} value={o}>{o}</option>)}
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
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Fecha factura desde</div>
                <input type="date" value={fDesde} onChange={(e) => { setFDesde(e.target.value); setPage(1); }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Fecha factura hasta</div>
                <input type="date" value={fHasta} onChange={(e) => { setFHasta(e.target.value); setPage(1); }} />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Buscar cliente / documento / secuencia factura o contrato</div>
                <input type="text" value={fBusqueda} onChange={(e) => { setFBusqueda(e.target.value); setPage(1); }} style={{ width: '100%' }} />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Listado de facturas</h3>
              <span className="hint">{filtrados.length} de {facturas.length} · página {pageSafe} de {pageCount}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Cliente</th>
                    <th>Sociedad</th><th>Operación</th><th>Secuencia contrato</th>
                    <th>Fecha factura</th><th>Valor total</th><th>Valor pagado</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((f) => (
                    <tr key={f.id}>
                      <td className="name">{f.clienteNombre || '—'}</td>
                      <td>{sociedadOf(f.joyeria)}</td>
                      <td>{f.operacion?.replace('Factura de venta ', '')}</td>
                      <td>{f.secuenciaContrato}</td>
                      <td>{fmtFecha(f.fechaFactura)}</td>
                      <td>{fmtMoney(f.valorTotal)}</td>
                      <td>{fmtMoney(f.valorPagado)}</td>
                      <td>{f.estado || '—'}</td>
                    </tr>
                  ))}
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

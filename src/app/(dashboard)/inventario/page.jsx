'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, startAfter, where, documentId } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { fmtMoney, fmtGr, fmtNum } from '@/lib/dataHelpers';
import { slugifyId } from '@/lib/importHelpers';

const MAX_FOTO_BYTES = 8 * 1024 * 1024;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const PAGE_SIZE = 50;

// El archivo de origen tiene ~340.000 filas y su hoja de datos pesa más de
// 600MB sin comprimir — muy por encima de lo que cualquier parser basado en
// strings (incluido SheetJS en el navegador) puede manejar de una vez. Por
// eso, a diferencia de Contratos/Facturas, este módulo no tiene botón de
// "Importar": la carga se hace con un script de administrador
// (scripts/importInventario.mjs) cada vez que llega un archivo nuevo, y la
// página solo lee lo que ya quedó en Firestore.
//
// Por el mismo motivo de tamaño, esta página tampoco carga todo el
// inventario al navegador: los KPIs y los filtros salen de un resumen
// pre-calculado (inventario_meta/resumen) y el listado se trae paginado
// directo de Firestore con un único filtro de igualdad a la vez (así nunca
// hace falta crear un índice compuesto).

const FILTROS = [
  { field: '__NONE__', label: 'Sin filtro' },
  { field: 'sociedad', label: 'Sociedad' },
  { field: 'ciudad', label: 'Ciudad' },
  { field: 'categoriaGeneral', label: 'Categoría' },
  { field: 'estado', label: 'Estado' },
];

function labelEdad(key) {
  if (key === '0' || !key) return 'Menor a 365 días';
  return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
}

function fmtFecha(s) {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

export default function InventarioPage() {
  const { isAdmin, getIdToken } = useAuth();
  const [resumen, setResumen] = useState(null);
  const [loadingResumen, setLoadingResumen] = useState(true);
  const [error, setError] = useState('');

  const [filterField, setFilterField] = useState('__NONE__');
  const [filterValue, setFilterValue] = useState('__ALL__');
  const [skuBusqueda, setSkuBusqueda] = useState('');
  const [skuResultado, setSkuResultado] = useState(undefined); // undefined = no buscado, null = no encontrado
  const [skuFoto, setSkuFoto] = useState(null); // {photo, identificacion} ya guardado para esta SKU
  const [identificando, setIdentificando] = useState(false);
  const [identificarError, setIdentificarError] = useState('');

  const [items, setItems] = useState([]);
  const [loadingPage, setLoadingPage] = useState(false);
  const [cursors, setCursors] = useState([null]); // cursors[i] = snapshot antes de la página i (null = inicio)
  const [pageIdx, setPageIdx] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'inventario_meta', 'resumen'));
        setResumen(snap.exists() ? snap.data() : null);
      } catch (err) {
        setError('No se pudo cargar el resumen de inventario: ' + err.message);
      } finally {
        setLoadingResumen(false);
      }
    })();
  }, []);

  async function loadPage(idx) {
    setLoadingPage(true);
    setError('');
    try {
      const clauses = [];
      if (filterField !== '__NONE__' && filterValue !== '__ALL__') clauses.push(where(filterField, '==', filterValue));
      clauses.push(orderBy(documentId()));
      const cursor = cursors[idx];
      if (cursor) clauses.push(startAfter(cursor));
      clauses.push(limit(PAGE_SIZE));
      const snap = await getDocs(query(collection(db, 'inventario'), ...clauses));
      const docs = snap.docs;
      setItems(docs.map((d) => ({ id: d.id, ...d.data() })));
      setHasMore(docs.length === PAGE_SIZE);
      setCursors((prev) => {
        const next = prev.slice(0, idx + 1);
        next[idx + 1] = docs.length ? docs[docs.length - 1] : null;
        return next;
      });
      setPageIdx(idx);
    } catch (err) {
      setError('No se pudo cargar el listado: ' + err.message);
    } finally {
      setLoadingPage(false);
    }
  }

  useEffect(() => {
    setCursors([null]);
    setPageIdx(0);
    loadPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterField, filterValue]);

  async function buscarSku() {
    const sku = skuBusqueda.trim();
    if (!sku) { setSkuResultado(undefined); return; }
    setError('');
    setIdentificarError('');
    try {
      const id = slugifyId(sku);
      const [snap, fotoSnap] = await Promise.all([
        getDoc(doc(db, 'inventario', id)),
        getDoc(doc(db, 'inventario_fotos', id)),
      ]);
      setSkuResultado(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setSkuFoto(fotoSnap.exists() ? fotoSnap.data() : null);
    } catch (err) {
      setError('No se pudo buscar el SKU: ' + err.message);
    }
  }

  async function handleIdentificarFoto(file) {
    if (!file || !skuResultado) return;
    if (file.size > MAX_FOTO_BYTES) {
      setIdentificarError('La foto pesa demasiado (máx. 8MB).');
      return;
    }
    setIdentificando(true);
    setIdentificarError('');
    try {
      const id = skuResultado.id;
      const path = `inventario/${id}/${Date.now()}-${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const src = await getDownloadURL(fileRef);
      const photo = { src, name: file.name, path, type: file.type };

      const imageBase64 = await readFileAsBase64(file);
      const token = await getIdToken();
      const res = await fetch('/api/identify-joya', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64, mimeType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo identificar la foto');

      const nuevo = { photo, identificacion: data.identificacion, identificadoEn: Date.now() };
      await setDoc(doc(db, 'inventario_fotos', id), nuevo);
      setSkuFoto(nuevo);
    } catch (err) {
      setIdentificarError(err.message);
    } finally {
      setIdentificando(false);
    }
  }

  const valoresFiltro = useMemo(() => {
    if (!resumen || filterField === '__NONE__') return [];
    const mapa = { sociedad: resumen.porSociedad, ciudad: resumen.porCiudad, categoriaGeneral: resumen.porCategoria, estado: resumen.porEstado }[filterField] || {};
    return Object.keys(mapa).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  }, [resumen, filterField]);

  const edadRows = useMemo(() => {
    if (!resumen?.porEdad) return [];
    return Object.entries(resumen.porEdad)
      .map(([key, count]) => ({ key, label: labelEdad(key), count }))
      .sort((a, b) => (a.key === '0' ? -1 : b.key === '0' ? 1 : a.label.localeCompare(b.label, 'es')));
  }, [resumen]);

  return (
    <div>
      <div className="topbar">
        <div><h1>Inventario</h1><p>Piezas de joyería en stock — gramos, costo, antigüedad y ubicación</p></div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <div className="panel" style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        Este inventario se actualiza manualmente: el archivo de origen (una fila por pieza, cientos de miles de
        registros) es demasiado grande para subirlo desde el navegador. Comparte el Excel actualizado cuando
        quieras refrescar estos datos.
        {resumen?.generadoEl && (
          <div style={{ marginTop: 6 }}>
            Última carga: {fmtFecha(resumen.generadoEl.slice(0, 10))} — archivo <b>{resumen.archivo}</b>
          </div>
        )}
      </div>

      {loadingResumen ? (
        <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>
      ) : !resumen ? (
        <div className="empty-note">Todavía no hay inventario cargado.</div>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi"><div className="label">Piezas en inventario</div><div className="value">{fmtNum(resumen.total)}</div></div>
            <div className="kpi"><div className="label">Gramos totales</div><div className="value">{fmtGr(resumen.gramosTotal)}</div></div>
            <div className="kpi"><div className="label">Costo total</div><div className="value">{fmtMoney(resumen.costoTotal)}</div></div>
            <div className="kpi"><div className="label">Valor de venta total</div><div className="value">{fmtMoney(resumen.valorVentaTotal)}</div></div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Antigüedad del inventario</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th style={{ textAlign: 'left' }}>Antigüedad</th><th>Piezas</th><th>% del total</th></tr></thead>
                <tbody>
                  {edadRows.map((r) => (
                    <tr key={r.key}>
                      <td className="name">{r.label}</td>
                      <td style={{ color: r.key !== '0' ? 'var(--gold-light)' : undefined, fontWeight: r.key !== '0' ? 700 : 400 }}>{fmtNum(r.count)}</td>
                      <td>{((r.count / resumen.total) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Buscar por SKU</h3></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Ej. 0000415187" value={skuBusqueda}
                onChange={(e) => setSkuBusqueda(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarSku()} style={{ width: 220 }} />
              <button className="btn" type="button" onClick={buscarSku}>Buscar</button>
            </div>
            {skuResultado === null && <div style={{ marginTop: 10, color: 'var(--text-dim)', fontSize: 12.5 }}>No se encontró esa SKU.</div>}
            {skuResultado && (
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table>
                  <thead>
                    <tr><th style={{ textAlign: 'left' }}>Descripción</th><th>Joyería</th><th>Gramos</th><th>Costo</th><th>Precio venta</th><th>Estado</th><th>Antigüedad</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="name">{skuResultado.descripcion || '—'}</td>
                      <td>{skuResultado.joyeria}</td>
                      <td>{fmtGr(skuResultado.gramos)}</td>
                      <td>{fmtMoney(skuResultado.costoTotal)}</td>
                      <td>{fmtMoney(skuResultado.precioVenta)}</td>
                      <td>{skuResultado.estado}</td>
                      <td>{labelEdad(skuResultado.edadInventario)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {skuResultado && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>Identificación por IA</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {skuFoto?.photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={skuFoto.photo.src} alt={skuFoto.photo.name} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                  )}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    {skuFoto?.identificacion ? (
                      <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>
                        <div><b>Tipo de producto:</b> {skuFoto.identificacion.tipo_producto}</div>
                        <div><b>Tejido / estilo:</b> {skuFoto.identificacion.tejido_o_estilo}</div>
                        <div><b>Patrón:</b> {skuFoto.identificacion.patron}</div>
                        <div><b>Confianza:</b> {skuFoto.identificacion.confianza}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>Esta pieza todavía no tiene foto ni identificación.</div>
                    )}
                    {isAdmin && (
                      <div style={{ marginTop: 10 }}>
                        <input type="file" accept="image/*" disabled={identificando}
                          onChange={(e) => handleIdentificarFoto(e.target.files?.[0])} style={{ fontSize: 11.5, color: 'var(--text-dim)' }} />
                        {identificando && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>Subiendo e identificando…</div>}
                        {identificarError && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{identificarError}</div>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Filtrar listado</h3></div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Filtrar por</div>
                <select value={filterField} onChange={(e) => { setFilterField(e.target.value); setFilterValue('__ALL__'); }}>
                  {FILTROS.map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
                </select>
              </div>
              {filterField !== '__NONE__' && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Valor</div>
                  <select value={filterValue} onChange={(e) => setFilterValue(e.target.value)}>
                    <option value="__ALL__">Todos</option>
                    {valoresFiltro.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Listado de piezas</h3>
              <span className="hint">página {pageIdx + 1}</span>
            </div>
            {loadingPage ? (
              <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>
            ) : items.length === 0 ? (
              <div className="empty-note">No hay piezas con este filtro.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>SKU</th><th style={{ textAlign: 'left' }}>Descripción</th>
                      <th>Joyería</th><th>Ciudad</th><th>Gramos</th><th>Costo</th><th>Precio venta</th>
                      <th>Ingreso</th><th>Estado</th><th>Antigüedad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td>{it.sku}</td>
                        <td className="name">{it.descripcion || '—'}</td>
                        <td>{it.joyeria}</td>
                        <td>{it.ciudad}</td>
                        <td>{fmtGr(it.gramos)}</td>
                        <td>{fmtMoney(it.costoTotal)}</td>
                        <td>{fmtMoney(it.precioVenta)}</td>
                        <td>{fmtFecha(it.fechaIngreso)}</td>
                        <td>{it.estado}</td>
                        <td>{labelEdad(it.edadInventario)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, alignItems: 'center' }}>
              <button className="btn-outline" type="button" onClick={() => loadPage(pageIdx - 1)} disabled={pageIdx <= 0 || loadingPage}>← Anterior</button>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>página {pageIdx + 1}</span>
              <button className="btn-outline" type="button" onClick={() => loadPage(pageIdx + 1)} disabled={!hasMore || loadingPage}>Siguiente →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

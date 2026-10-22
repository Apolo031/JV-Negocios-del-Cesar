'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { BRANCHES, BRANCH_COLOR, MONTH_NAMES_FULL, fmtMoney, fmtNum } from '@/lib/dataHelpers';
import { parseReparacionesBuffer } from '@/lib/reparacionesParser';

const ARTICULOS = ['Cadena', 'Pulsera', 'Anillo', 'Aretes', 'Dije', 'Reloj', 'Otro'];
const SERVICIOS = ['Brillado', 'Limpieza', 'Ajuste', 'Pulido', 'Enderezado', 'Soldadura', 'Otro'];
const ESTADOS = ['Pendiente', 'En proceso', 'Terminada', 'Entregada'];
const WRITE_CHUNK = 450;

const FORM_VACIO = {
  sucursal: BRANCHES[0], fecha: '', esCliente: 'Sí', nombre: '', telefono: '', direccion: '',
  articulo: ARTICULOS[0], servicio: SERVICIOS[0], responsable: '', estado: 'Pendiente', valor: '', observaciones: '',
};

function fmtFecha(s) {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function monthKey(fecha) { return fecha ? fecha.slice(0, 7) : '—'; }
function monthKeyLabel(key) {
  if (key === '—') return 'Sin fecha';
  const [y, m] = key.split('-');
  return `${MONTH_NAMES_FULL[parseInt(m, 10) - 1]} ${y}`;
}

/** El "Valor" a veces es un número y a veces texto (ej. "RESEÑA" para servicios de cortesía). */
function fmtValor(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return v !== '' && !isNaN(n) && /^[\d.,\s]+$/.test(String(v)) ? fmtMoney(n) : String(v);
}

function ImportarReparaciones({ onImported }) {
  const { isAdmin } = useAuth();
  const [sucursalImport, setSucursalImport] = useState(BRANCHES[0]);
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
      const buffer = await file.arrayBuffer();
      const reparaciones = parseReparacionesBuffer(buffer).map((r) => ({ sucursal: sucursalImport, ...r }));
      if (reparaciones.length === 0) {
        throw new Error('No se reconoció ningún registro en el archivo (se esperaba la columna "Nombre completo").');
      }

      let done = 0;
      for (let i = 0; i < reparaciones.length; i += WRITE_CHUNK) {
        const slice = reparaciones.slice(i, i + WRITE_CHUNK);
        const batch = writeBatch(db);
        for (const reparacion of slice) {
          batch.set(doc(collection(db, 'reparaciones')), { ...reparacion, createdAt: Date.now() });
        }
        await batch.commit();
        done += slice.length;
        setProgress({ done, total: reparaciones.length });
      }

      setResult({ count: reparaciones.length });
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
      <div className="panel-head"><h3>Importar reparaciones</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        Sube el Excel de control de reparaciones (columnas Fecha, ¿Es cliente?, Nombre completo, Teléfono,
        Dirección, Artículo / joya, Servicio, Responsable, Estado, Valor, Observaciones). Cada fila se agrega
        como un registro nuevo — si ya importaste este archivo antes, no lo vuelvas a subir para no duplicar.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={sucursalImport} onChange={(e) => setSucursalImport(e.target.value)}>
          {BRANCHES.map((b) => <option key={b}>{b}</option>)}
        </select>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files[0] || null)} style={{ fontSize: 12, color: 'var(--text-dim)' }} />
        <button className="btn" onClick={handleImport} disabled={importing || !file}>
          {importing ? (progress ? `Importando… (${progress.done}/${progress.total})` : 'Leyendo archivo…') : 'Importar archivo'}
        </button>
      </div>
      {error && <div className="login-error">{error}</div>}
      {result && <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 12 }}>Listo: se cargaron {result.count} reparaciones.</div>}
    </div>
  );
}

export default function ReparacionesPage() {
  const { isAdmin, role } = useAuth();
  const canEditar = isAdmin || role === 'colaborador'; // crear/editar — eliminar sigue siendo solo del admin
  const { reparaciones, addReparacion, updateReparacion, deleteReparacion } = useData();

  const [form, setForm] = useState(FORM_VACIO);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [fSucursal, setFSucursal] = useState('__ALL__');
  const [fMes, setFMes] = useState('__ALL__');
  const [mesSucursal, setMesSucursal] = useState('__ALL__'); // sucursal propia del panel "Resumen mes a mes"
  const [fEstado, setFEstado] = useState('__ALL__');
  const [fServicio, setFServicio] = useState('__ALL__');
  const [fResponsable, setFResponsable] = useState('__ALL__');
  const [fBusqueda, setFBusqueda] = useState('');

  const responsables = useMemo(
    () => [...new Set(reparaciones.map((r) => r.responsable).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [reparaciones]
  );

  const meses = useMemo(
    () => [...new Set(reparaciones.map((r) => monthKey(r.fecha)))].sort().reverse(),
    [reparaciones]
  );

  const filtradas = useMemo(() => {
    const busq = fBusqueda.trim().toLowerCase();
    return reparaciones
      .slice()
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
      .filter((r) => {
        if (fSucursal !== '__ALL__' && r.sucursal !== fSucursal) return false;
        if (fMes !== '__ALL__' && monthKey(r.fecha) !== fMes) return false;
        if (fEstado !== '__ALL__' && r.estado !== fEstado) return false;
        if (fServicio !== '__ALL__' && r.servicio !== fServicio) return false;
        if (fResponsable !== '__ALL__' && r.responsable !== fResponsable) return false;
        if (busq && !`${r.nombre} ${r.telefono}`.toLowerCase().includes(busq)) return false;
        return true;
      });
  }, [reparaciones, fSucursal, fMes, fEstado, fServicio, fResponsable, fBusqueda]);

  const kpis = useMemo(() => {
    const total = filtradas.length;
    const terminadas = filtradas.filter((r) => r.estado === 'Terminada').length;
    const entregadas = filtradas.filter((r) => r.estado === 'Entregada').length;
    const pendientes = filtradas.filter((r) => r.estado === 'Pendiente' || r.estado === 'En proceso').length;
    const clientes = filtradas.filter((r) => r.esCliente === 'Sí').length;
    return { total, terminadas, entregadas, pendientes, clientes };
  }, [filtradas]);

  // Resumen por sucursal: siempre sobre TODOS los registros (no el filtro
  // actual), para tener de un vistazo cómo va cada una de las 6 sucursales.
  const porSucursal = useMemo(() => {
    return BRANCHES.map((b) => {
      const deLaSucursal = reparaciones.filter((r) => r.sucursal === b);
      return {
        sucursal: b,
        total: deLaSucursal.length,
        pendientes: deLaSucursal.filter((r) => r.estado === 'Pendiente' || r.estado === 'En proceso').length,
        terminadas: deLaSucursal.filter((r) => r.estado === 'Terminada').length,
        entregadas: deLaSucursal.filter((r) => r.estado === 'Entregada').length,
      };
    });
  }, [reparaciones]);

  // Resumen mes a mes: tiene su propio selector de sucursal (independiente
  // del filtro de la tabla de abajo), para poder ver la evolución de una
  // sucursal sin afectar el listado.
  const porMes = useMemo(() => {
    const base = mesSucursal === '__ALL__' ? reparaciones : reparaciones.filter((r) => r.sucursal === mesSucursal);
    return meses.map((key) => {
      const delMes = base.filter((r) => monthKey(r.fecha) === key);
      return {
        key, label: monthKeyLabel(key),
        total: delMes.length,
        pendientes: delMes.filter((r) => r.estado === 'Pendiente' || r.estado === 'En proceso').length,
        terminadas: delMes.filter((r) => r.estado === 'Terminada').length,
        entregadas: delMes.filter((r) => r.estado === 'Entregada').length,
      };
    });
  }, [reparaciones, meses, mesSucursal]);

  function editar(r) {
    setEditId(r.id);
    setForm({
      sucursal: r.sucursal || BRANCHES[0], fecha: r.fecha || '', esCliente: r.esCliente || 'Sí',
      nombre: r.nombre || '', telefono: r.telefono || '', direccion: r.direccion || '',
      articulo: r.articulo || ARTICULOS[0], servicio: r.servicio || SERVICIOS[0], responsable: r.responsable || '',
      estado: r.estado || 'Pendiente', valor: r.valor ?? '', observaciones: r.observaciones || '',
    });
  }

  function cancelarEdicion() {
    setEditId(null);
    setForm(FORM_VACIO);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) { setError('El nombre del cliente es obligatorio.'); return; }
    setSaving(true);
    setError('');
    try {
      const entry = { ...form, nombre: form.nombre.trim(), telefono: form.telefono.trim(), direccion: form.direccion.trim() };
      if (editId) await updateReparacion(editId, entry);
      else await addReparacion(entry);
      cancelarEdicion();
    } catch (err) {
      setError('No se pudo guardar el registro: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function limpiarFiltros() {
    setFSucursal('__ALL__'); setFMes('__ALL__'); setFEstado('__ALL__'); setFServicio('__ALL__'); setFResponsable('__ALL__'); setFBusqueda('');
  }

  function handleExportExcel() {
    const rows = filtradas.map((r) => ({
      Sucursal: r.sucursal, Fecha: r.fecha, '¿Es cliente?': r.esCliente, 'Nombre completo': r.nombre,
      Teléfono: r.telefono, Dirección: r.direccion, 'Artículo / joya': r.articulo, Servicio: r.servicio,
      Responsable: r.responsable, Estado: r.estado, Valor: r.valor, Observaciones: r.observaciones,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Reparaciones');
    XLSX.writeFile(wb, `reparaciones_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Reparaciones</h1><p>Control de reparaciones de joyas — cliente, artículo, servicio, responsable y estado</p></div>
      </div>

      {!canEditar && (
        <div className="readonly-banner">
          Tu rol es de <b>solo lectura</b>: puedes ver todos los registros, pero agregar, editar o eliminar solo lo puede hacer un administrador o colaborador.
        </div>
      )}
      {canEditar && !isAdmin && (
        <div className="readonly-banner">
          Tu rol es de <b>colaborador</b>: puedes agregar y editar registros, pero eliminarlos solo lo puede hacer un administrador.
        </div>
      )}

      {error && <div className="login-error">{error}</div>}

      <div className="kpi-row">
        <div className="kpi"><div className="label">Reparaciones (filtro actual)</div><div className="value">{fmtNum(kpis.total)}</div></div>
        <div className="kpi"><div className="label">Pendientes / en proceso</div><div className="value">{fmtNum(kpis.pendientes)}</div></div>
        <div className="kpi"><div className="label">Terminadas</div><div className="value">{fmtNum(kpis.terminadas)}</div></div>
        <div className="kpi"><div className="label">Entregadas</div><div className="value">{fmtNum(kpis.entregadas)}</div></div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Resumen por sucursal</h3></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {porSucursal.map((s) => {
            const max = Math.max(1, ...porSucursal.map((x) => x.total));
            return (
              <div key={s.sucursal} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 100, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{s.sucursal}</div>
                <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden', height: 22, position: 'relative' }}>
                  <div style={{ width: `${(s.total / max) * 100}%`, background: BRANCH_COLOR[s.sucursal], height: '100%', minWidth: s.total ? 3 : 0 }} />
                </div>
                <div style={{ width: 230, flexShrink: 0, fontSize: 12, color: 'var(--text-dim)', textAlign: 'right' }}>
                  <b style={{ color: 'var(--text)' }}>{fmtNum(s.total)}</b> total
                  {' · '}<span style={{ color: s.pendientes > 0 ? 'var(--gold-light)' : undefined, fontWeight: s.pendientes > 0 ? 700 : 400 }}>{s.pendientes} pend.</span>
                  {' · '}{s.terminadas} term. · {s.entregadas} entr.
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Resumen mes a mes</h3>
          <select value={mesSucursal} onChange={(e) => setMesSucursal(e.target.value)}>
            <option value="__ALL__">Todas las sucursales</option>
            {BRANCHES.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        {porMes.length === 0 ? (
          <div className="empty-note">Aún no hay reparaciones con fecha para resumir por mes.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {porMes.map((m) => {
              const max = Math.max(1, ...porMes.map((x) => x.total));
              return (
                <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 130, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{m.label}</div>
                  <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden', height: 22, position: 'relative' }}>
                    <div style={{ width: `${(m.total / max) * 100}%`, background: 'var(--gold)', height: '100%', minWidth: m.total ? 3 : 0 }} />
                  </div>
                  <div style={{ width: 230, flexShrink: 0, fontSize: 12, color: 'var(--text-dim)', textAlign: 'right' }}>
                    <b style={{ color: 'var(--text)' }}>{fmtNum(m.total)}</b> total
                    {' · '}<span style={{ color: m.pendientes > 0 ? 'var(--gold-light)' : undefined, fontWeight: m.pendientes > 0 ? 700 : 400 }}>{m.pendientes} pend.</span>
                    {' · '}{m.terminadas} term. · {m.entregadas} entr.
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ImportarReparaciones />

      {canEditar && (
        <div className="panel">
          <div className="panel-head"><h3>{editId ? 'Editar registro' : 'Nuevo registro'}</h3></div>
          <form onSubmit={handleSubmit} className="form-grid">
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Sucursal</div>
              <select value={form.sucursal} onChange={(e) => setForm({ ...form, sucursal: e.target.value })} style={{ width: '100%' }}>
                {BRANCHES.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Fecha</div>
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>¿Es cliente?</div>
              <select value={form.esCliente} onChange={(e) => setForm({ ...form, esCliente: e.target.value })} style={{ width: '100%' }}>
                <option>Sí</option><option>No</option>
              </select>
            </div>
            <div className="fg-span2">
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Nombre completo</div>
              <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Teléfono</div>
              <input type="text" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div className="fg-span2">
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Dirección</div>
              <input type="text" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Artículo / joya</div>
              <select value={form.articulo} onChange={(e) => setForm({ ...form, articulo: e.target.value })} style={{ width: '100%' }}>
                {ARTICULOS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Servicio</div>
              <select value={form.servicio} onChange={(e) => setForm({ ...form, servicio: e.target.value })} style={{ width: '100%' }}>
                {SERVICIOS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Responsable</div>
              <input type="text" value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} list="responsables-sugeridos" style={{ width: '100%' }} />
              <datalist id="responsables-sugeridos">{responsables.map((r) => <option key={r} value={r} />)}</datalist>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Estado</div>
              <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} style={{ width: '100%' }}>
                {ESTADOS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Valor</div>
              <input type="text" placeholder="Ej: 50000 o RESEÑA" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div className="fg-span5">
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Observaciones</div>
              <input type="text" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" type="submit" disabled={saving}>{saving ? 'Guardando…' : editId ? 'Guardar cambios' : '+ Agregar'}</button>
              {editId && <button className="btn-outline" type="button" onClick={cancelarEdicion}>Cancelar</button>}
            </div>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>Filtros</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-outline" type="button" onClick={limpiarFiltros}>Limpiar filtros</button>
            <button className="btn-outline" type="button" onClick={handleExportExcel} disabled={filtradas.length === 0}>⭳ Descargar Excel</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Sucursal</div>
            <select value={fSucursal} onChange={(e) => setFSucursal(e.target.value)}>
              <option value="__ALL__">Todas</option>
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Mes</div>
            <select value={fMes} onChange={(e) => setFMes(e.target.value)}>
              <option value="__ALL__">Todos</option>
              {meses.map((m) => <option key={m} value={m}>{monthKeyLabel(m)}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Estado</div>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
              <option value="__ALL__">Todos</option>
              {ESTADOS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Servicio</div>
            <select value={fServicio} onChange={(e) => setFServicio(e.target.value)}>
              <option value="__ALL__">Todos</option>
              {SERVICIOS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Responsable</div>
            <select value={fResponsable} onChange={(e) => setFResponsable(e.target.value)}>
              <option value="__ALL__">Todos</option>
              {responsables.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Buscar cliente / teléfono</div>
            <input type="text" value={fBusqueda} onChange={(e) => setFBusqueda(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Listado de reparaciones</h3>
          <span className="hint">{filtradas.length} {filtradas.length === 1 ? 'registro' : 'registros'}</span>
        </div>
        {filtradas.length === 0 ? (
          <div className="empty-note">Aún no hay reparaciones registradas{canEditar ? '. Agrega la primera arriba o importa el Excel.' : '.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Cliente</th><th>Sucursal</th><th>Fecha</th><th>Teléfono</th>
                  <th>Artículo</th><th>Servicio</th><th>Responsable</th><th>Estado</th><th>Valor</th>
                  <th style={{ textAlign: 'left' }}>Observaciones</th>
                  {canEditar && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((r) => (
                  <tr key={r.id}>
                    <td className="name">{r.nombre}</td>
                    <td>{r.sucursal}</td>
                    <td>{fmtFecha(r.fecha)}</td>
                    <td>{r.telefono || '—'}</td>
                    <td>{r.articulo}</td>
                    <td>{r.servicio}</td>
                    <td>{r.responsable || '—'}</td>
                    <td style={{ fontWeight: r.estado === 'Pendiente' ? 700 : 400, color: r.estado === 'Pendiente' ? 'var(--gold-light)' : undefined }}>{r.estado || '—'}</td>
                    <td>{fmtValor(r.valor)}</td>
                    <td>{r.observaciones || '—'}</td>
                    {canEditar && (
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-outline" onClick={() => editar(r)}>Editar</button>
                        {isAdmin && <button className="btn-outline" onClick={() => deleteReparacion(r.id)}>Eliminar</button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

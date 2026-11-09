'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { MONTH_NAMES_FULL } from '@/lib/dataHelpers';
import { parseNombreFactura, SERVICIOS } from '@/lib/facturasServiciosParser';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const TIPOS_DOC_ACEPTADOS = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

function esArchivoAceptado(file) {
  return file.type.startsWith('image/') || TIPOS_DOC_ACEPTADOS.includes(file.type);
}

let idCounter = 0;
function nextId() { idCounter += 1; return `f_${Date.now()}_${idCounter}`; }

function periodoLabel(periodo) {
  if (!periodo) return '—';
  const [y, m] = periodo.split('-');
  return `${MONTH_NAMES_FULL[parseInt(m, 10) - 1]} ${y}`;
}

const AÑOS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i);

function SubirFacturas({ inmueblesPorContrato, onGuardado }) {
  const { isAdmin } = useAuth();
  const hoy = new Date();
  const [periodoAnio, setPeriodoAnio] = useState(hoy.getFullYear());
  const [periodoMes, setPeriodoMes] = useState(hoy.getMonth() + 1);
  const [items, setItems] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [progress, setProgress] = useState(null);
  const [mensaje, setMensaje] = useState('');

  if (!isAdmin) return null;

  function agregarArchivos(fileList) {
    const nuevos = Array.from(fileList || [])
      .filter(esArchivoAceptado)
      .map((f) => {
        const { contrato, servicio, subunidad } = parseNombreFactura(f.name);
        const partes = (f.webkitRelativePath || '').split('/');
        const municipio = partes.length >= 2 ? partes[partes.length - 2] : '';
        return {
          id: nextId(), file: f, nombre: f.name,
          contrato: contrato || '', servicio, subunidad: subunidad || '', municipio,
        };
      });
    if (nuevos.length) setItems((prev) => [...prev, ...nuevos]);
    setMensaje('');
  }

  function actualizarItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function quitarItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }
  function limpiarTodo() {
    setItems([]);
    setMensaje('');
  }

  async function handleGuardarTodo() {
    const aGuardar = items.filter((it) => it.contrato.trim());
    const sinContrato = items.length - aGuardar.length;
    if (aGuardar.length === 0) {
      setMensaje('Error: ningún archivo tiene un número de contrato asignado.');
      return;
    }

    setGuardando(true);
    setMensaje('');
    const periodo = `${periodoAnio}-${String(periodoMes).padStart(2, '0')}`;
    let done = 0;
    try {
      for (const it of aGuardar) {
        if (it.file.size > MAX_FILE_BYTES) throw new Error(`"${it.nombre}" pesa más de 8 MB.`);
        const contrato = it.contrato.trim();
        const path = `facturas_servicios/${contrato}/${periodo}/${Date.now()}-${it.file.name}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, it.file, { contentType: it.file.type });
        const src = await getDownloadURL(fileRef);
        await addDoc(collection(db, 'facturas_servicios'), {
          contrato, servicio: it.servicio, subunidad: it.subunidad.trim() || null,
          municipio: it.municipio || inmueblesPorContrato.get(contrato)?.municipio || null,
          periodo,
          archivo: { src, name: it.file.name, path, type: it.file.type },
          actualizadoEn: Date.now(),
        });
        done += 1;
        setProgress({ done, total: aGuardar.length });
      }
      setMensaje(`Listo: ${aGuardar.length} factura${aGuardar.length === 1 ? '' : 's'} guardada${aGuardar.length === 1 ? '' : 's'} para ${periodoLabel(periodo)}${sinContrato > 0 ? ` — ${sinContrato} sin contrato no se guardaron` : ''}.`);
      setItems((prev) => prev.filter((it) => !it.contrato.trim()));
      onGuardado?.();
    } catch (err) {
      setMensaje('Error: ' + err.message);
    } finally {
      setGuardando(false);
      setProgress(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Subir facturas</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        Sube varios archivos a la vez (o una carpeta completa) — el nombre de cada uno se usa para adivinar el
        contrato y el servicio (ej. "CONTRATO 194 EPM.pdf"). <b>Revisa y corrige antes de guardar</b>: algunos
        nombres no traen el contrato claro y hay que asignarlo a mano.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Mes de la factura</div>
          <select value={periodoMes} onChange={(e) => setPeriodoMes(parseInt(e.target.value, 10))}>
            {MONTH_NAMES_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Año</div>
          <select value={periodoAnio} onChange={(e) => setPeriodoAnio(parseInt(e.target.value, 10))}>
            {AÑOS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <label className="btn-outline" style={{ cursor: 'pointer' }}>
          Elegir archivos
          <input type="file" multiple accept="application/pdf,image/*,.docx" onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
        </label>
        <label className="btn-outline" style={{ cursor: 'pointer' }}>
          Elegir carpeta completa
          <input type="file" multiple webkitdirectory="" directory="" onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
        </label>
        {items.length > 0 && <button className="btn-outline" type="button" onClick={limpiarTodo}>Quitar todos</button>}
      </div>

      {items.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Archivo</th>
                  <th>Municipio</th>
                  <th>Contrato</th>
                  <th style={{ textAlign: 'left' }}>¿A quién pertenece?</th>
                  <th>Servicio</th>
                  <th>Subunidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const match = it.contrato.trim() ? inmueblesPorContrato.get(it.contrato.trim()) : null;
                  return (
                    <tr key={it.id}>
                      <td className="name" style={{ fontSize: 12 }}>{it.nombre}</td>
                      <td style={{ fontSize: 12 }}>{it.municipio || '—'}</td>
                      <td>
                        <input
                          type="text" value={it.contrato} placeholder="?"
                          onChange={(e) => actualizarItem(it.id, { contrato: e.target.value.replace(/[^\d]/g, '') })}
                          style={{ width: 64, textAlign: 'center', borderColor: it.contrato && !match ? 'var(--red)' : undefined }}
                        />
                      </td>
                      <td style={{ fontSize: 11.5, color: match ? 'var(--text-dim)' : 'var(--red)' }}>
                        {!it.contrato.trim() ? 'Falta asignar contrato' : match ? `${match.propietario || '—'} · ${match.direccion || ''}` : 'No existe ese contrato en Base principal'}
                      </td>
                      <td>
                        <select value={it.servicio} onChange={(e) => actualizarItem(it.id, { servicio: e.target.value })}>
                          {SERVICIOS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text" value={it.subunidad} placeholder="—"
                          onChange={(e) => actualizarItem(it.id, { subunidad: e.target.value })}
                          style={{ width: 100 }}
                        />
                      </td>
                      <td><button className="btn-outline" type="button" onClick={() => quitarItem(it.id)}>Quitar</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="btn" type="button" onClick={handleGuardarTodo} disabled={guardando}>
            {guardando ? (progress ? `Guardando… (${progress.done}/${progress.total})` : 'Guardando…') : `Guardar ${items.filter((it) => it.contrato.trim()).length} factura(s) de ${periodoLabel(`${periodoAnio}-${String(periodoMes).padStart(2, '0')}`)}`}
          </button>
        </>
      )}
      {mensaje && <div className={mensaje.startsWith('Error') ? 'login-error' : ''} style={{ marginTop: 12, fontSize: 12.5, color: mensaje.startsWith('Error') ? undefined : 'var(--green)' }}>{mensaje}</div>}
    </div>
  );
}

export default function FacturaServiciosPublicosPage() {
  const { isAdmin } = useAuth();
  const [facturas, setFacturas] = useState([]);
  const [inmuebles, setInmuebles] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fPeriodo, setFPeriodo] = useState('__ALL__');
  const [fMunicipio, setFMunicipio] = useState('__ALL__');
  const [fServicio, setFServicio] = useState('__ALL__');
  const [fBusqueda, setFBusqueda] = useState('');

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, 'facturas_servicios'), (snap) => {
      setFacturas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const unsub2 = onSnapshot(collection(db, 'inmuebles'), (snap) => {
      setInmuebles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const inmueblesPorContrato = useMemo(() => {
    const map = new Map();
    inmuebles.forEach((r) => {
      if (r.contrato !== null && r.contrato !== undefined) {
        map.set(String(r.contrato), { propietario: r.propietario, direccion: r.direccion, municipio: r.municipio });
      }
    });
    return map;
  }, [inmuebles]);

  const periodos = useMemo(() => [...new Set(facturas.map((f) => f.periodo))].sort().reverse(), [facturas]);
  const municipios = useMemo(
    () => [...new Set(facturas.map((f) => f.municipio).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [facturas]
  );

  const filtradas = useMemo(() => {
    const busq = fBusqueda.trim().toLowerCase();
    return facturas
      .filter((f) => {
        if (fPeriodo !== '__ALL__' && f.periodo !== fPeriodo) return false;
        if (fMunicipio !== '__ALL__' && f.municipio !== fMunicipio) return false;
        if (fServicio !== '__ALL__' && f.servicio !== fServicio) return false;
        if (busq) {
          const info = inmueblesPorContrato.get(f.contrato);
          const hay = `${f.contrato} ${info?.propietario || ''} ${info?.direccion || ''} ${f.municipio || ''}`.toLowerCase();
          if (!hay.includes(busq)) return false;
        }
        return true;
      })
      .sort((a, b) => b.periodo.localeCompare(a.periodo) || (a.municipio || '').localeCompare(b.municipio || '', 'es') || Number(a.contrato) - Number(b.contrato));
  }, [facturas, fPeriodo, fMunicipio, fServicio, fBusqueda, inmueblesPorContrato]);

  async function handleEliminar(f) {
    try {
      await deleteObject(ref(storage, f.archivo.path));
    } catch (err) {
      // si ya no existe en Storage, igual se quita el registro
    }
    await deleteDoc(doc(db, 'facturas_servicios', f.id));
  }

  function limpiarFiltros() {
    setFPeriodo('__ALL__'); setFMunicipio('__ALL__'); setFServicio('__ALL__'); setFBusqueda('');
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Factura servicios públicos</h1><p>Zona Centro inmobiliaria — energía, acueducto, gas y demás servicios por contrato</p></div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><div className="label">Facturas cargadas</div><div className="value">{facturas.length}</div></div>
        <div className="kpi"><div className="label">Periodos</div><div className="value">{periodos.length}</div></div>
        <div className="kpi"><div className="label">Municipios</div><div className="value">{municipios.length}</div></div>
      </div>

      <SubirFacturas inmueblesPorContrato={inmueblesPorContrato} />

      <div className="panel">
        <div className="panel-head">
          <h3>Filtros</h3>
          <button className="btn-outline" type="button" onClick={limpiarFiltros}>Limpiar filtros</button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Periodo</div>
            <select value={fPeriodo} onChange={(e) => setFPeriodo(e.target.value)}>
              <option value="__ALL__">Todos</option>
              {periodos.map((p) => <option key={p} value={p}>{periodoLabel(p)}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Municipio</div>
            <select value={fMunicipio} onChange={(e) => setFMunicipio(e.target.value)}>
              <option value="__ALL__">Todos</option>
              {municipios.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Servicio</div>
            <select value={fServicio} onChange={(e) => setFServicio(e.target.value)}>
              <option value="__ALL__">Todos</option>
              {SERVICIOS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Buscar contrato / propietario / dirección</div>
            <input type="text" value={fBusqueda} onChange={(e) => setFBusqueda(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Facturas</h3>
          <span className="hint">{filtradas.length} {filtradas.length === 1 ? 'registro' : 'registros'}</span>
        </div>
        {loading ? (
          <div className="empty-note">Cargando…</div>
        ) : facturas.length === 0 ? (
          <div className="empty-note">Aún no hay facturas cargadas{isAdmin ? '. Súbelas arriba para empezar.' : '.'}</div>
        ) : filtradas.length === 0 ? (
          <div className="empty-note">Ninguna factura coincide con los filtros.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Periodo</th><th>Contrato</th><th style={{ textAlign: 'left' }}>Propietario / dirección</th>
                  <th>Municipio</th><th>Servicio</th><th>Subunidad</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((f) => {
                  const info = inmueblesPorContrato.get(f.contrato);
                  return (
                    <tr key={f.id}>
                      <td>{periodoLabel(f.periodo)}</td>
                      <td>{f.contrato}</td>
                      <td className="name">{info ? `${info.propietario || '—'} · ${info.direccion || ''}` : <span style={{ color: 'var(--red)' }}>Contrato no encontrado</span>}</td>
                      <td>{f.municipio || info?.municipio || '—'}</td>
                      <td>{f.servicio}</td>
                      <td>{f.subunidad || '—'}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <a className="btn-outline" href={f.archivo?.src} target="_blank" rel="noopener noreferrer">Ver</a>
                        {isAdmin && <button className="btn-outline" onClick={() => handleEliminar(f)}>Eliminar</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

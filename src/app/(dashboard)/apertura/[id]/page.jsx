'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { APERTURA_AREAS, areaCanonica, padreDe, ESTADOS_APERTURA, ESTADO_LABEL, PRIORIDADES, PRIORIDAD_LABEL, PRIORIDAD_COLOR } from '@/lib/aperturaTemplate';

function fmtFecha(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Vencida = tiene fecha límite, ya pasó, y la tarea no está completada. */
function estaVencida(item) {
  return !!(item.fechaLimite && item.fechaLimite < hoyISO() && item.estado !== 'completado');
}

/**
 * Agrupa los items de un área en filas raíz (lo que se ve siempre) más sus
 * hijos (lo que aparece al desplegar), usando `padreDe()` — que compara por
 * el texto del concepto, no por id, para que funcione igual sin importar en
 * qué sucursal esté cada copia de la tarea.
 */
function construirFilasAnidadas(items) {
  const porConcepto = new Set(items.map((it) => it.concepto));
  const padresConcepto = new Set(
    items.map((it) => padreDe(it)).filter((p) => p && porConcepto.has(p))
  );
  const raiz = items.filter((it) => {
    const p = padreDe(it);
    return !(p && porConcepto.has(p));
  });
  return raiz.map((it) => ({
    item: it,
    esPadre: padresConcepto.has(it.concepto),
    hijos: padresConcepto.has(it.concepto) ? items.filter((h) => padreDe(h) === it.concepto) : [],
  }));
}

const ESTADO_PILL = { completado: 'pos', en_proceso: 'warn', pendiente: 'neg' };
const ESTADO_COLOR = { completado: 'var(--green)', en_proceso: 'var(--gold)', pendiente: 'var(--red)' };
const AVATAR_PALETTE = ['#c7a339', '#4f9d69', '#5b8ac5', '#b2558e', '#c1443a', '#6b8e23'];

function iniciales(nombre) {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase();
}
function colorDeNombre(nombre) {
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/** Punto de color (🔴🟡🟢) para identificar el estado de un vistazo, sin tener que leer el texto. */
function Semaforo({ estado, size = 9 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block', width: size, height: size, borderRadius: '50%',
        background: ESTADO_COLOR[estado] || 'var(--text-dimmer)', flexShrink: 0,
      }}
    />
  );
}

function Avatar({ nombre, size = 22 }) {
  if (!nombre?.trim()) return <span style={{ color: 'var(--text-dimmer)', fontSize: 11 }}>Sin asignar</span>;
  return (
    <span
      title={nombre}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size,
        borderRadius: '50%', background: colorDeNombre(nombre), color: '#fff', fontSize: size * 0.45, fontWeight: 700, flexShrink: 0,
      }}
    >
      {iniciales(nombre)}
    </span>
  );
}

/** Días completos transcurridos entre una fecha (YYYY-MM-DD) y hoy. */
function diasDesde(fechaISO) {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.split('-').map(Number);
  const inicio = new Date(y, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoy - inicio) / 86400000));
}

function FechaInicioApertura({ aperturaId, fechaInicio, isAdmin }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(fechaInicio || '');
  useEffect(() => { setValor(fechaInicio || ''); }, [fechaInicio]);

  async function guardar() {
    await updateDoc(doc(db, 'aperturas', aperturaId), { fechaInicio: valor || null });
    setEditando(false);
  }

  if (editando) {
    return (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <input type="date" value={valor} onChange={(e) => setValor(e.target.value)} style={{ fontSize: 12.5 }} />
        <button className="btn-outline" type="button" style={{ padding: '2px 8px', fontSize: 11.5 }} onClick={guardar}>Guardar</button>
      </span>
    );
  }

  return (
    <span>
      {fechaInicio ? `Inicio: ${fmtFecha(fechaInicio)}` : 'Sin fecha de inicio'}
      {isAdmin && <button className="btn-outline" type="button" style={{ marginLeft: 8, padding: '1px 7px', fontSize: 11 }} onClick={() => setEditando(true)}>Editar</button>}
    </span>
  );
}

function FlagPrioridad({ prioridad }) {
  if (!prioridad || prioridad === 'ninguna') return <span style={{ color: 'var(--text-dimmer)' }}>⚑</span>;
  return <span style={{ color: PRIORIDAD_COLOR[prioridad] }} title={PRIORIDAD_LABEL[prioridad]}>⚑</span>;
}

function ItemFila({
  item, canEditar, onCambiarEstado, onGuardarObservaciones, onGuardarResponsable, onGuardarFechaLimite, onCambiarPrioridad, onEliminar, isAdmin,
  esPadre, numHijos, expandido, onToggle, esHijo,
}) {
  const [obs, setObs] = useState(item.observaciones || '');
  useEffect(() => { setObs(item.observaciones || ''); }, [item.observaciones]);
  const [responsable, setResponsable] = useState(item.responsable || '');
  useEffect(() => { setResponsable(item.responsable || ''); }, [item.responsable]);
  const vencida = estaVencida(item);

  return (
    <tr style={esHijo ? { background: 'var(--surface-2)' } : undefined}>
      <td className="name" style={{ fontSize: 13, paddingLeft: esHijo ? 28 : undefined }}>
        {esPadre && (
          <button
            type="button" onClick={onToggle} aria-label={expandido ? 'Colapsar' : 'Desplegar'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', marginRight: 6, fontSize: 11 }}
          >
            {expandido ? '▾' : '▸'}
          </button>
        )}
        {item.concepto}
        {esPadre && <span className="hint" style={{ marginLeft: 6 }}>{numHijos}</span>}
      </td>
      <td>
        {canEditar ? (
          <input
            type="text" value={responsable} placeholder="Nombre…"
            onChange={(e) => setResponsable(e.target.value)}
            onBlur={() => { if (responsable !== (item.responsable || '')) onGuardarResponsable(item.id, responsable); }}
            style={{ width: 100, fontSize: 12 }}
          />
        ) : (
          <Avatar nombre={item.responsable} />
        )}
      </td>
      <td>
        {canEditar ? (
          <input
            type="date" value={item.fechaLimite || ''}
            onChange={(e) => onGuardarFechaLimite(item.id, e.target.value)}
            style={{ fontSize: 11.5, colorScheme: 'auto', borderColor: vencida ? 'var(--red)' : undefined, color: vencida ? 'var(--red)' : undefined }}
          />
        ) : (
          <span style={{ fontSize: 12, color: vencida ? 'var(--red)' : 'var(--text-dim)', fontWeight: vencida ? 700 : 400 }}>{item.fechaLimite ? fmtFecha(item.fechaLimite) : '—'}</span>
        )}
      </td>
      <td>
        {canEditar ? (
          <select
            value={item.prioridad || 'ninguna'} onChange={(e) => onCambiarPrioridad(item.id, e.target.value)}
            style={{ fontSize: 12, color: PRIORIDAD_COLOR[item.prioridad || 'ninguna'] }}
          >
            {PRIORIDADES.map((p) => <option key={p} value={p}>{PRIORIDAD_LABEL[p]}</option>)}
          </select>
        ) : (
          <span><FlagPrioridad prioridad={item.prioridad} /> {PRIORIDAD_LABEL[item.prioridad || 'ninguna']}</span>
        )}
      </td>
      <td>
        {canEditar ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Semaforo estado={item.estado} />
            <select
              value={item.estado} onChange={(e) => onCambiarEstado(item.id, e.target.value)}
              style={{ fontSize: 12, borderColor: ESTADO_COLOR[item.estado], color: ESTADO_COLOR[item.estado], fontWeight: 600 }}
            >
              {ESTADOS_APERTURA.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
            </select>
          </span>
        ) : (
          <span className={`pill ${ESTADO_PILL[item.estado]}`}><Semaforo estado={item.estado} size={7} /> {ESTADO_LABEL[item.estado]}</span>
        )}
      </td>
      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{item.fechaFinalizacion ? fmtFecha(new Date(item.fechaFinalizacion).toISOString().slice(0, 10)) : '—'}</td>
      <td style={{ textAlign: 'left' }}>
        {canEditar ? (
          <input
            type="text" value={obs} placeholder="Observación…"
            onChange={(e) => setObs(e.target.value)}
            onBlur={() => { if (obs !== (item.observaciones || '')) onGuardarObservaciones(item.id, obs); }}
            style={{ width: '100%', fontSize: 12 }}
          />
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{item.observaciones || '—'}</span>
        )}
      </td>
      {isAdmin && (
        <td><button className="btn-outline" type="button" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => onEliminar(item.id)}>Quitar</button></td>
      )}
    </tr>
  );
}

function TareaCard({ item, areaNombre, canEditar, onCambiarEstado }) {
  return (
    <div
      draggable={canEditar}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; }}
      style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)', borderLeft: `3px solid ${ESTADO_COLOR[item.estado]}`,
        borderRadius: 8, padding: '9px 11px', marginBottom: 8, cursor: canEditar ? 'grab' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
        <div style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>{areaNombre}</div>
        <FlagPrioridad prioridad={item.prioridad} />
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.35 }}>{item.concepto}</div>
      {item.observaciones && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 5 }}>📝 {item.observaciones}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }}>
        <Avatar nombre={item.responsable} size={20} />
        {item.fechaLimite && (
          <span style={{ fontSize: 10.5, color: estaVencida(item) ? 'var(--red)' : 'var(--text-dimmer)', fontWeight: estaVencida(item) ? 700 : 400 }}>
            📅 {fmtFecha(item.fechaLimite)}
          </span>
        )}
      </div>
      {canEditar && (
        <select
          value={item.estado} onChange={(e) => onCambiarEstado(item.id, e.target.value)}
          style={{ marginTop: 7, fontSize: 11, width: '100%' }}
        >
          {ESTADOS_APERTURA.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
        </select>
      )}
    </div>
  );
}

/** Tablero tipo Kanban: las mismas tareas que la vista de lista, pero como tarjetas que se arrastran entre columnas para cambiar su estado. */
function TableroKanban({ items, areaNombrePorKey, canEditar, onCambiarEstado }) {
  const [filtroArea, setFiltroArea] = useState('__ALL__');
  const [colOver, setColOver] = useState(null);

  const filtrados = filtroArea === '__ALL__' ? items : items.filter((it) => areaCanonica(it.area) === filtroArea);

  function handleDrop(e, estado) {
    e.preventDefault();
    setColOver(null);
    const id = e.dataTransfer.getData('text/plain');
    if (id) onCambiarEstado(id, estado);
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Tablero</h3>
        <select value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)} style={{ fontSize: 12.5 }}>
          <option value="__ALL__">Todas las áreas</option>
          {APERTURA_AREAS.map((a) => <option key={a.key} value={a.key}>{a.nombre}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {ESTADOS_APERTURA.map((estado) => {
          const columna = filtrados.filter((it) => it.estado === estado);
          return (
            <div
              key={estado}
              onDragOver={(e) => { e.preventDefault(); setColOver(estado); }}
              onDragLeave={() => setColOver((c) => (c === estado ? null : c))}
              onDrop={(e) => handleDrop(e, estado)}
              style={{
                background: colOver === estado ? 'rgba(199,163,57,0.08)' : 'var(--surface)',
                border: `1.5px dashed ${colOver === estado ? 'var(--gold)' : 'var(--border)'}`,
                borderRadius: 10, padding: 10, minHeight: 160, maxHeight: 640, overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12.5, fontWeight: 700, color: ESTADO_COLOR[estado] }}>
                <Semaforo estado={estado} /> {ESTADO_LABEL[estado]} <span className="hint">{columna.length}</span>
              </div>
              {columna.map((item) => (
                <TareaCard key={item.id} item={item} areaNombre={areaNombrePorKey[areaCanonica(item.area)]} canEditar={canEditar} onCambiarEstado={onCambiarEstado} />
              ))}
              {columna.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--text-dimmer)', textAlign: 'center', marginTop: 20 }}>Sin tareas</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Agrega una tarea al checklist — y, para que quede igual en todas las
 * sucursales (no solo en la que se está viendo), la replica de una vez en
 * el checklist de cada una de las demás sucursales activas. Cada copia
 * queda independiente desde ahí (marcar una como completada en una
 * sucursal no afecta a las demás), pero la tarea en sí ya existe en todas.
 */
function AgregarTarea({ area, padresDisponibles, aperturaId, onAgregada }) {
  const [abierto, setAbierto] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [padreConcepto, setPadreConcepto] = useState('__NINGUNO__');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  async function handleAgregar() {
    if (!concepto.trim()) return;
    setGuardando(true);
    setMensaje('');
    try {
      const orden = Date.now();
      const base = {
        area, concepto: concepto.trim(), estado: 'pendiente',
        padreConcepto: padreConcepto !== '__NINGUNO__' ? padreConcepto : null,
        orden, observaciones: null, actualizadoEn: Date.now(),
      };
      const otras = (await getDocs(collection(db, 'aperturas'))).docs.filter((d) => d.id !== aperturaId && !d.data().archivada);

      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'apertura_items')), { ...base, aperturaId });
      otras.forEach((a) => {
        batch.set(doc(collection(db, 'apertura_items')), { ...base, aperturaId: a.id });
      });
      await batch.commit();

      setConcepto(''); setPadreConcepto('__NINGUNO__'); setAbierto(false);
      setMensaje(otras.length > 0 ? `Agregada aquí y en ${otras.length} sucursal${otras.length === 1 ? '' : 'es'} más.` : 'Agregada.');
      onAgregada?.();
    } finally {
      setGuardando(false);
    }
  }

  if (!abierto) {
    return (
      <div>
        <button className="btn-outline" type="button" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setAbierto(true)}>+ Agregar tarea</button>
        {mensaje && <span style={{ marginLeft: 10, fontSize: 11.5, color: 'var(--green)' }}>{mensaje}</span>}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Nueva tarea…"
        style={{ fontSize: 12, flex: 1, maxWidth: 280 }} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') handleAgregar(); }}
      />
      {padresDisponibles.length > 0 && (
        <select value={padreConcepto} onChange={(e) => setPadreConcepto(e.target.value)} style={{ fontSize: 12 }}>
          <option value="__NINGUNO__">Sin anidar</option>
          {padresDisponibles.map((p) => <option key={p} value={p}>Anidar bajo: {p}</option>)}
        </select>
      )}
      <button className="btn-outline" type="button" onClick={handleAgregar} disabled={guardando} style={{ fontSize: 12 }}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
      <button className="btn-outline" type="button" style={{ fontSize: 12 }} onClick={() => { setAbierto(false); setConcepto(''); setPadreConcepto('__NINGUNO__'); }}>Cancelar</button>
      <div style={{ fontSize: 11, color: 'var(--text-dimmer)', width: '100%' }}>Se agrega aquí y en todas las demás sucursales activas.</div>
    </div>
  );
}

/**
 * Bitácora de novedades: notas con fecha que cualquiera puede dejar sobre
 * una tarea (completada o no) sin tener que reabrirla. Queda como historial
 * permanente — así quien entre dentro de meses ve de una vez qué quedó
 * pendiente de revisar, aunque el checklist ya esté al 100%.
 */
function HistorialNovedades({ aperturaId, items, novedades, canEditar, isAdmin, userEmail }) {
  const [itemId, setItemId] = useState('__GENERAL__');
  const [fecha, setFecha] = useState(hoyISO());
  const [descripcion, setDescripcion] = useState('');
  const [guardando, setGuardando] = useState(false);

  const ordenadas = [...novedades].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.creadoEn || 0) - (a.creadoEn || 0));
  const abiertas = ordenadas.filter((n) => n.estado === 'abierta');

  async function handleAgregar() {
    if (!descripcion.trim()) return;
    setGuardando(true);
    try {
      const itemSel = itemId !== '__GENERAL__' ? items.find((it) => it.id === itemId) : null;
      await setDoc(doc(collection(db, 'apertura_novedades')), {
        aperturaId, itemId: itemSel ? itemSel.id : null, itemConcepto: itemSel ? itemSel.concepto : null,
        fecha, descripcion: descripcion.trim(), estado: 'abierta', creadoPor: userEmail || null, creadoEn: Date.now(),
      });
      setDescripcion(''); setFecha(hoyISO()); setItemId('__GENERAL__');
    } finally {
      setGuardando(false);
    }
  }

  async function toggleResuelta(n) {
    const pasaAResuelta = n.estado === 'abierta';
    await updateDoc(doc(db, 'apertura_novedades', n.id), {
      estado: pasaAResuelta ? 'resuelta' : 'abierta',
      resueltoPor: pasaAResuelta ? (userEmail || null) : null,
      resueltoEn: pasaAResuelta ? Date.now() : null,
    });
  }
  async function eliminar(n) {
    await deleteDoc(doc(db, 'apertura_novedades', n.id));
  }

  return (
    <div className="panel" id="novedades">
      <div className="panel-head">
        <h3>Historial y novedades</h3>
        <span className="hint">{abiertas.length} abierta{abiertas.length === 1 ? '' : 's'} · {ordenadas.length} en total</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        Queda como bitácora: aunque una tarea ya esté "Completado", cualquiera puede dejar aquí una novedad con fecha
        (ej. "faltan las herramientas") sin tener que reabrir la tarea — así el próximo que entre, aunque sea dentro
        de meses, ve de una vez qué falta revisar.
      </div>

      {canEditar && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Tarea relacionada</div>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ fontSize: 12.5, maxWidth: 220 }}>
              <option value="__GENERAL__">General (toda la sucursal)</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.concepto}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Fecha de la novedad</div>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ fontSize: 12.5 }} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Qué pasó</div>
            <input
              type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. Faltan las herramientas, sigue en curso…" style={{ fontSize: 12.5, width: '100%' }}
            />
          </div>
          <button className="btn" type="button" onClick={handleAgregar} disabled={guardando || !descripcion.trim()}>
            {guardando ? 'Guardando…' : '+ Registrar novedad'}
          </button>
        </div>
      )}

      {ordenadas.length === 0 ? (
        <div className="empty-note">Todavía no hay novedades registradas.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th style={{ textAlign: 'left' }}>Tarea</th><th style={{ textAlign: 'left' }}>Novedad</th>
                <th>Estado</th><th>Registrada por</th><th>Resuelta por</th>{canEditar && <th></th>}
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((n) => (
                <tr key={n.id}>
                  <td style={{ fontSize: 12 }}>{fmtFecha(n.fecha)}</td>
                  <td className="name" style={{ fontSize: 12 }}>{n.itemConcepto || 'General'}</td>
                  <td style={{ textAlign: 'left', fontSize: 12.5 }}>{n.descripcion}</td>
                  <td><span className={`pill ${n.estado === 'abierta' ? 'neg' : 'pos'}`}>{n.estado === 'abierta' ? 'Abierta' : 'Resuelta'}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>{n.creadoPor || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-dimmer)' }}>
                    {n.estado === 'resuelta' && n.resueltoPor
                      ? `${n.resueltoPor}${n.resueltoEn ? ` · ${fmtFecha(new Date(n.resueltoEn).toISOString().slice(0, 10))}` : ''}`
                      : '—'}
                  </td>
                  {canEditar && (
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn-outline" type="button" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => toggleResuelta(n)}>
                        {n.estado === 'abierta' ? 'Marcar resuelta' : 'Reabrir'}
                      </button>
                      {isAdmin && <button className="btn-outline" type="button" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => eliminar(n)}>Borrar</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResponsableArea({ area, areaInfo, isAdmin }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(areaInfo?.responsableNombre || '');
  const [correo, setCorreo] = useState(areaInfo?.responsableEmail || '');

  useEffect(() => {
    setNombre(areaInfo?.responsableNombre || '');
    setCorreo(areaInfo?.responsableEmail || '');
  }, [areaInfo?.responsableNombre, areaInfo?.responsableEmail]);

  async function guardar() {
    await setDoc(doc(db, 'apertura_areas', area), {
      nombre: APERTURA_AREAS.find((a) => a.key === area)?.nombre || area,
      responsableNombre: nombre.trim() || null, responsableEmail: correo.trim() || null,
    }, { merge: true });
    setEditando(false);
  }

  if (!isAdmin && !areaInfo?.responsableNombre && !areaInfo?.responsableEmail) return null;

  if (editando) {
    return (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11.5 }}>
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Responsable" style={{ width: 120, fontSize: 11.5 }} />
        <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="correo@..." style={{ width: 160, fontSize: 11.5 }} />
        <button className="btn-outline" type="button" style={{ padding: '1px 7px', fontSize: 11 }} onClick={guardar}>Guardar</button>
      </span>
    );
  }

  return (
    <span style={{ fontSize: 11.5, color: 'var(--text-dimmer)' }}>
      {areaInfo?.responsableNombre || areaInfo?.responsableEmail
        ? `Responsable: ${areaInfo?.responsableNombre || ''}${areaInfo?.responsableEmail ? ` · ${areaInfo.responsableEmail}` : ''}`
        : 'Sin responsable asignado'}
      {isAdmin && <button className="btn-outline" type="button" style={{ marginLeft: 8, padding: '1px 7px', fontSize: 11 }} onClick={() => setEditando(true)}>Editar</button>}
    </span>
  );
}

export default function AperturaDetallePage({ params }) {
  const { user, isAdmin, role } = useAuth();
  const canEditar = isAdmin || role === 'colaborador';
  const [apertura, setApertura] = useState(null);
  const [items, setItems] = useState([]);
  const [areas, setAreas] = useState({});
  const [novedades, setNovedades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [colapsadas, setColapsadas] = useState(() => new Set());
  const [gruposColapsados, setGruposColapsados] = useState(() => new Set());
  const [vista, setVista] = useState('lista');

  useEffect(() => {
    const unsub1 = onSnapshot(doc(db, 'aperturas', params.id), (snap) => {
      setApertura(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
    const q = query(collection(db, 'apertura_items'), where('aperturaId', '==', params.id));
    const unsub2 = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsub3 = onSnapshot(collection(db, 'apertura_areas'), (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data(); });
      setAreas(map);
    });
    const qNov = query(collection(db, 'apertura_novedades'), where('aperturaId', '==', params.id));
    const unsub4 = onSnapshot(qNov, (snap) => {
      setNovedades(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [params.id]);

  const porArea = useMemo(() => {
    return APERTURA_AREAS.map((a) => {
      const propios = items.filter((it) => areaCanonica(it.area) === a.key).sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0));
      const completado = propios.filter((it) => it.estado === 'completado').length;
      const enProceso = propios.filter((it) => it.estado === 'en_proceso').length;
      return { ...a, items: propios, total: propios.length, completado, enProceso, pendiente: propios.length - completado - enProceso };
    }).filter((a) => a.total > 0);
  }, [items]);

  const areaNombrePorKey = useMemo(() => Object.fromEntries(APERTURA_AREAS.map((a) => [a.key, a.nombre])), []);

  const totales = useMemo(() => {
    const total = items.length;
    const completado = items.filter((it) => it.estado === 'completado').length;
    const enProceso = items.filter((it) => it.estado === 'en_proceso').length;
    const vencidas = items.filter(estaVencida).length;
    const pct = total ? Math.round((completado / total) * 100) : 0;
    const fechaCompletado100 = pct === 100
      ? items.reduce((max, it) => (it.fechaFinalizacion && it.fechaFinalizacion > (max || 0) ? it.fechaFinalizacion : max), null)
      : null;
    return { total, completado, enProceso, vencidas, pendiente: total - completado - enProceso, pct, fechaCompletado100 };
  }, [items]);

  const novedadesAbiertas = useMemo(() => novedades.filter((n) => n.estado === 'abierta').length, [novedades]);

  function toggleArea(key) {
    setColapsadas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleGrupo(concepto) {
    setGruposColapsados((prev) => {
      const next = new Set(prev);
      if (next.has(concepto)) next.delete(concepto); else next.add(concepto);
      return next;
    });
  }

  async function handleCambiarEstado(itemId, estado) {
    await updateDoc(doc(db, 'apertura_items', itemId), {
      estado, actualizadoEn: Date.now(), fechaFinalizacion: estado === 'completado' ? Date.now() : null,
    });
  }
  async function handleGuardarObservaciones(itemId, observaciones) {
    await updateDoc(doc(db, 'apertura_items', itemId), { observaciones: observaciones.trim() || null, actualizadoEn: Date.now() });
  }
  async function handleGuardarResponsable(itemId, responsable) {
    await updateDoc(doc(db, 'apertura_items', itemId), { responsable: responsable.trim() || null, actualizadoEn: Date.now() });
  }
  async function handleGuardarFechaLimite(itemId, fechaLimite) {
    await updateDoc(doc(db, 'apertura_items', itemId), { fechaLimite: fechaLimite || null, actualizadoEn: Date.now() });
  }
  async function handleCambiarPrioridad(itemId, prioridad) {
    await updateDoc(doc(db, 'apertura_items', itemId), { prioridad, actualizadoEn: Date.now() });
  }
  async function handleEliminarItem(itemId) {
    await deleteDoc(doc(db, 'apertura_items', itemId));
  }
  async function handleArchivar() {
    await updateDoc(doc(db, 'aperturas', params.id), { archivada: !apertura.archivada });
  }

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>;
  if (!apertura) {
    return (
      <div>
        <Link href="/apertura" style={{ fontSize: 12, color: 'var(--text-dim)' }}>← Seguimiento de apertura</Link>
        <div className="alert-empty" style={{ marginTop: 14 }}>Esta sucursal en apertura no existe (puede que haya sido eliminada).</div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <Link href="/apertura" style={{ fontSize: 12, color: 'var(--text-dim)' }}>← Seguimiento de apertura</Link>
          <h1 style={{ marginTop: 4 }}>🏗️ {apertura.nombre}{apertura.archivada ? ' (archivada)' : ''}</h1>
          <p>
            {apertura.municipio ? `${apertura.municipio} · ` : ''}
            <FechaInicioApertura aperturaId={apertura.id} fechaInicio={apertura.fechaInicio} isAdmin={isAdmin} />
            {' · '}{apertura.fechaObjetivo ? `Meta de apertura: ${fmtFecha(apertura.fechaObjetivo)}` : 'Sin fecha objetivo'}
          </p>
        </div>
        {isAdmin && (
          <button className="btn-outline" type="button" onClick={handleArchivar}>
            {apertura.archivada ? 'Reactivar' : 'Archivar sucursal'}
          </button>
        )}
      </div>

      {novedadesAbiertas > 0 ? (
        <a href="#novedades" className="alert-card sev-high" style={{ display: 'flex', textDecoration: 'none', color: 'inherit' }}>
          <div className="alert-icon">⚠</div>
          <div className="alert-body">
            <div className="alert-title">{novedadesAbiertas} novedad{novedadesAbiertas === 1 ? '' : 'es'} pendiente{novedadesAbiertas === 1 ? '' : 's'} de revisar</div>
            <div className="alert-desc">Alguien dejó una observación sobre una o varias tareas — revísala en "Historial y novedades" más abajo.</div>
          </div>
        </a>
      ) : totales.pct === 100 ? (
        <div className="alert-card sev-low">
          <div className="alert-icon">✓</div>
          <div className="alert-body">
            <div className="alert-title">Checklist completo al 100%{totales.fechaCompletado100 ? ` desde el ${fmtFecha(new Date(totales.fechaCompletado100).toISOString().slice(0, 10))}` : ''}</div>
            <div className="alert-desc">Sin novedades abiertas por ahora. Si al verificar algo falta, déjalo anotado en "Historial y novedades" sin necesidad de reabrir la tarea.</div>
          </div>
        </div>
      ) : null}

      <div className="kpi-row">
        {apertura.fechaInicio && (
          <div className="kpi"><div className="label">Días en curso</div><div className="value">{diasDesde(apertura.fechaInicio)}</div></div>
        )}
        <div className="kpi"><div className="label">Avance general</div><div className="value">{totales.pct}%</div></div>
        <div className="kpi"><div className="label">Completadas</div><div className="value">{totales.completado} / {totales.total}</div></div>
        <div className="kpi"><div className="label">En proceso</div><div className="value">{totales.enProceso}</div></div>
        <div className="kpi"><div className="label">Pendientes</div><div className="value">{totales.pendiente}</div></div>
        {totales.vencidas > 0 && (
          <div className="kpi"><div className="label">Vencidas</div><div className="value" style={{ color: 'var(--red)' }}>{totales.vencidas}</div></div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Avance por área</h3></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {porArea.map((a) => {
            const pct = a.total ? Math.round((a.completado / a.total) * 100) : 0;
            const color = pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';
            return (
              <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 220, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{a.nombre}</div>
                <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden', height: 18 }}>
                  <div style={{ width: `${pct}%`, background: color, height: '100%', minWidth: pct > 0 ? 3 : 0 }} />
                </div>
                <div style={{ width: 90, flexShrink: 0, fontSize: 12, textAlign: 'right' }}>{a.completado}/{a.total} · <b style={{ color }}>{pct}%</b></div>
              </div>
            );
          })}
        </div>
      </div>

      <HistorialNovedades aperturaId={apertura.id} items={items} novedades={novedades} canEditar={canEditar} isAdmin={isAdmin} userEmail={user?.email} />

      <div style={{ display: 'flex', gap: 8, margin: '0 0 16px' }}>
        <button className={`btn-toggle${vista === 'lista' ? ' active' : ''}`} type="button" onClick={() => setVista('lista')}>☰ Lista</button>
        <button className={`btn-toggle${vista === 'tablero' ? ' active' : ''}`} type="button" onClick={() => setVista('tablero')}>▦ Tablero</button>
      </div>

      {vista === 'tablero' && (
        <TableroKanban items={items} areaNombrePorKey={areaNombrePorKey} canEditar={canEditar} onCambiarEstado={handleCambiarEstado} />
      )}

      {vista === 'lista' && porArea.map((a) => {
        const colapsada = colapsadas.has(a.key);
        return (
          <div className="panel" key={a.key}>
            <div className="panel-head" style={{ cursor: 'pointer' }} onClick={() => toggleArea(a.key)}>
              <h3>{a.nombre} <span className="hint">{a.completado}/{a.total}</span></h3>
              <span className="nav-chevron" aria-hidden="true" style={{ transform: colapsada ? 'rotate(-90deg)' : 'none' }}>▾</span>
            </div>
            <div style={{ marginBottom: 8 }} onClick={(e) => e.stopPropagation()}>
              <ResponsableArea area={a.key} areaInfo={areas[a.key]} isAdmin={isAdmin} />
            </div>
            {!colapsada && (
              <div onClick={(e) => e.stopPropagation()}>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Tarea</th><th>Persona asignada</th><th>Fecha límite</th><th>Prioridad</th>
                        <th>Estado</th><th>Fecha de finalización</th><th style={{ textAlign: 'left' }}>Observaciones</th>
                        {isAdmin && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {construirFilasAnidadas(a.items).map(({ item, esPadre, hijos }) => {
                        const expandido = !gruposColapsados.has(item.concepto);
                        return (
                          <Fragment key={item.id}>
                            <ItemFila
                              item={item} canEditar={canEditar} isAdmin={isAdmin}
                              esPadre={esPadre} numHijos={hijos.length} expandido={expandido} onToggle={() => toggleGrupo(item.concepto)}
                              onCambiarEstado={handleCambiarEstado}
                              onGuardarObservaciones={handleGuardarObservaciones}
                              onGuardarResponsable={handleGuardarResponsable}
                              onGuardarFechaLimite={handleGuardarFechaLimite}
                              onCambiarPrioridad={handleCambiarPrioridad}
                              onEliminar={handleEliminarItem}
                            />
                            {esPadre && expandido && hijos.map((hijo) => (
                              <ItemFila
                                key={hijo.id} item={hijo} canEditar={canEditar} isAdmin={isAdmin} esHijo
                                onCambiarEstado={handleCambiarEstado}
                                onGuardarObservaciones={handleGuardarObservaciones}
                                onGuardarResponsable={handleGuardarResponsable}
                                onGuardarFechaLimite={handleGuardarFechaLimite}
                                onCambiarPrioridad={handleCambiarPrioridad}
                                onEliminar={handleEliminarItem}
                              />
                            ))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {isAdmin && (
                  <AgregarTarea
                    area={a.key} aperturaId={apertura.id}
                    padresDisponibles={[...new Set(a.items.filter((it) => !padreDe(it)).map((it) => it.concepto))]}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

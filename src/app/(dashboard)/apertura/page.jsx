'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { APERTURA_TEMPLATE } from '@/lib/aperturaTemplate';

function fmtFecha(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function NuevaApertura({ onCreada }) {
  const { isAdmin } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [fechaObjetivo, setFechaObjetivo] = useState('');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');

  if (!isAdmin) return null;

  async function handleCrear() {
    if (!nombre.trim()) { setError('Ponle un nombre a la joyería (ej. "Joyería Metro").'); return; }
    setCreando(true);
    setError('');
    try {
      const ref = doc(collection(db, 'aperturas'));
      const batch = writeBatch(db);
      batch.set(ref, {
        nombre: nombre.trim(), municipio: municipio.trim() || null,
        fechaObjetivo: fechaObjetivo || null, archivada: false, creadoEn: Date.now(),
      });
      APERTURA_TEMPLATE.forEach((t, i) => {
        batch.set(doc(collection(db, 'apertura_items')), {
          aperturaId: ref.id, area: t.area, concepto: t.concepto, estado: 'pendiente',
          orden: i, observaciones: null, actualizadoEn: Date.now(),
        });
      });
      await batch.commit();
      setNombre(''); setMunicipio(''); setFechaObjetivo(''); setAbierto(false);
      onCreada?.(ref.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreando(false);
    }
  }

  if (!abierto) {
    return <button className="btn" type="button" onClick={() => setAbierto(true)}>+ Nueva sucursal en apertura</button>;
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Nueva sucursal en apertura</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14 }}>
        Crea el checklist completo de apertura para esta joyería, organizado por área responsable — listo para empezar a marcar avance.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Nombre de la joyería</div>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Joyería Metro" style={{ width: 220 }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Municipio (opcional)</div>
          <input type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="Medellín" style={{ width: 180 }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Fecha objetivo de apertura (opcional)</div>
          <input type="date" value={fechaObjetivo} onChange={(e) => setFechaObjetivo(e.target.value)} />
        </div>
        <button className="btn" type="button" onClick={handleCrear} disabled={creando}>
          {creando ? 'Creando…' : 'Crear checklist'}
        </button>
        <button className="btn-outline" type="button" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
      {error && <div className="login-error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}

export default function AperturaIndexPage() {
  const router = useRouter();
  const [aperturas, setAperturas] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, 'aperturas'), (snap) => {
      setAperturas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const unsub2 = onSnapshot(collection(db, 'apertura_items'), (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const resumenPorApertura = useMemo(() => {
    const map = new Map();
    items.forEach((it) => {
      if (!map.has(it.aperturaId)) map.set(it.aperturaId, { total: 0, completado: 0 });
      const r = map.get(it.aperturaId);
      r.total += 1;
      if (it.estado === 'completado') r.completado += 1;
    });
    return map;
  }, [items]);

  const activas = aperturas.filter((a) => !a.archivada).sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
  const archivadas = aperturas.filter((a) => a.archivada);

  return (
    <div>
      <div className="topbar">
        <div><h1>Seguimiento de apertura</h1><p>Checklist de apertura por sucursal nueva, organizado por área responsable</p></div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><div className="label">Sucursales en apertura</div><div className="value">{activas.length}</div></div>
        <div className="kpi"><div className="label">Archivadas</div><div className="value">{archivadas.length}</div></div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Sucursales</h3></div>
        <NuevaApertura onCreada={(id) => router.push(`/apertura/${id}`)} />
        {loading ? (
          <div className="empty-note" style={{ marginTop: 14 }}>Cargando…</div>
        ) : activas.length === 0 ? (
          <div className="empty-note" style={{ marginTop: 14 }}>Todavía no hay ninguna sucursal en apertura — crea la primera arriba.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginTop: 14 }}>
            {activas.map((a) => {
              const r = resumenPorApertura.get(a.id) || { total: 0, completado: 0 };
              const pct = r.total ? Math.round((r.completado / r.total) * 100) : 0;
              const color = pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';
              return (
                <Link
                  key={a.id} href={`/apertura/${a.id}`}
                  style={{
                    display: 'block', border: '1px solid var(--border)', borderRadius: 10, padding: '16px',
                    background: 'var(--surface-2)', textDecoration: 'none', color: 'var(--text)',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700 }}>🏗️ {a.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                    {a.municipio ? `${a.municipio} · ` : ''}{a.fechaObjetivo ? `Meta: ${fmtFecha(a.fechaObjetivo)}` : 'Sin fecha objetivo'}
                  </div>
                  <div style={{ marginTop: 10, background: 'var(--surface)', borderRadius: 6, overflow: 'hidden', height: 10 }}>
                    <div style={{ width: `${pct}%`, background: color, height: '100%' }} />
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{r.completado} / {r.total} tareas</span>
                    <b style={{ color }}>{pct}%</b>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {archivadas.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>Archivadas</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {archivadas.map((a) => (
              <Link key={a.id} href={`/apertura/${a.id}`} style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                🏗️ {a.nombre}{a.municipio ? ` · ${a.municipio}` : ''}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

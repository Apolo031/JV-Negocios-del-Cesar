'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { municipioASlug, normalizarMunicipio, tituloMunicipio } from '@/lib/municipios';

/**
 * Selector de municipios: cada uno es su propio espacio (mismo tablero
 * completo de facturas — subir, extraer con IA, consolidado mensual...)
 * para que siempre quede claro dónde subir cada archivo o carpeta.
 */
export default function FacturaServiciosPublicosIndexPage() {
  const [inmuebles, setInmuebles] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, 'inmuebles'), (snap) => {
      setInmuebles(snap.docs.map((d) => d.data()));
      setLoading(false);
    });
    const unsub2 = onSnapshot(collection(db, 'facturas_servicios'), (snap) => {
      setFacturas(snap.docs.map((d) => d.data()));
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const municipios = useMemo(() => {
    const map = new Map(); // clave normalizada -> { label, conteo }
    inmuebles.forEach((r) => {
      const key = normalizarMunicipio(r.municipio);
      if (key && !map.has(key)) map.set(key, { label: tituloMunicipio(key), conteo: 0 });
    });
    // Por si algún municipio de las facturas no está (todavía) en Base principal.
    facturas.forEach((f) => {
      const key = normalizarMunicipio(f.municipio);
      if (key && !map.has(key)) map.set(key, { label: tituloMunicipio(key), conteo: 0 });
    });
    facturas.forEach((f) => {
      const key = normalizarMunicipio(f.municipio);
      if (key && map.has(key)) map.get(key).conteo += 1;
    });
    return [...map.entries()]
      .map(([key, v]) => ({ key, slug: municipioASlug(key), ...v }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [inmuebles, facturas]);

  const totalFacturas = facturas.length;

  return (
    <div>
      <div className="topbar">
        <div><h1>Factura servicios públicos</h1><p>Zona Centro inmobiliaria — elige el municipio donde vas a subir o revisar facturas</p></div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><div className="label">Municipios</div><div className="value">{municipios.length}</div></div>
        <div className="kpi"><div className="label">Facturas cargadas</div><div className="value">{totalFacturas}</div></div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Ver todo junto</h3></div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14 }}>
          El consolidado y el gasto por servicio de todos los municipios a la vez, en un solo lugar.
        </div>
        <Link href="/factura-servicios-publicos/todos" className="btn">Ver todos los municipios juntos</Link>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Municipios</h3>
          <span className="hint">{municipios.length} {municipios.length === 1 ? 'espacio' : 'espacios'}</span>
        </div>
        {loading ? (
          <div className="empty-note">Cargando…</div>
        ) : municipios.length === 0 ? (
          <div className="empty-note">Aún no hay municipios — primero importa el Excel en "Base principal".</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {municipios.map((m) => (
              <Link
                key={m.key} href={`/factura-servicios-publicos/${m.slug}`}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px',
                  background: 'var(--surface-2)', textDecoration: 'none', color: 'var(--text)',
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>🏘️ {m.label}</span>
                <span className={`pill ${m.conteo > 0 ? 'pos' : 'neu'}`}>{m.conteo}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

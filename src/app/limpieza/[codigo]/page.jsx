'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ESTADO_LIMPIEZA_LABEL, estadoEfectivoLimpieza } from '@/lib/limpiezaHelpers';

function fmtFechaCorta(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

const ESTADO_COLOR = { pendiente: 'var(--gold)', atendida: 'var(--green)', no_realizada: 'var(--red)', vencida: 'var(--red)' };
const ESTADO_TEXTO = { ...ESTADO_LIMPIEZA_LABEL, vencida: 'Código vencido' };

export default function LimpiezaEstadoPage({ params }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/limpieza-estado?codigo=${encodeURIComponent(params.codigo)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo consultar el código.');
        setDatos(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.codigo]);

  return (
    <div className="login-shell">
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
        {loading ? (
          <div style={{ color: 'var(--text-dim)' }}>Consultando…</div>
        ) : error ? (
          <>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, color: 'var(--text)' }}>No encontramos ese código</h1>
            <p style={{ color: 'var(--text-dim)', fontSize: 13.5, marginTop: 10 }}>{error}</p>
            <Link href="/limpieza" className="btn" style={{ display: 'inline-block', marginTop: 20, textDecoration: 'none' }}>Pedir un código nuevo</Link>
          </>
        ) : (
          <>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 700, letterSpacing: 1, color: 'var(--gold-light)' }}>
              {datos.codigo}
            </div>
            <div
              style={{
                display: 'inline-block', marginTop: 14, padding: '6px 16px', borderRadius: 99, fontSize: 13, fontWeight: 700,
                color: ESTADO_COLOR[estadoEfectivoLimpieza(datos)], background: 'var(--surface-2)',
              }}
            >
              {ESTADO_TEXTO[estadoEfectivoLimpieza(datos)]}
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginTop: 24, textAlign: 'left' }}>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Sucursal</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{datos.sucursal}</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Registrado el</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{fmtFechaCorta(datos.fechaRegistro)}</div>

              {datos.estado === 'atendida' && (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Tu joya</div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>
                    {[datos.categoria, datos.metal, datos.kilataje, datos.pesoGramos ? `${datos.pesoGramos} g` : null].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {datos.fotoUrl && (
                    <img src={datos.fotoUrl} alt="Foto de la joya" style={{ width: '100%', borderRadius: 10, marginTop: 6 }} />
                  )}
                </>
              )}

              {estadoEfectivoLimpieza(datos) === 'pendiente' && (
                <div style={{ fontSize: 12.5, color: 'var(--text-dimmer)' }}>Válido hasta el {fmtFechaCorta(new Date(datos.fechaLimite).getTime())}.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

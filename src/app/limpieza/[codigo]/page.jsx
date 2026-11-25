'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import FichaLimpiezaCard from '@/components/FichaLimpiezaCard';
import { ESTADO_LIMPIEZA_LABEL, estadoEfectivoLimpieza } from '@/lib/limpiezaHelpers';

function fmtFechaCorta(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtFechaLarga(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(d, 10)} ${MESES[parseInt(m, 10) - 1]} ${y}`;
}

const ESTADO_COLOR = { pendiente: '#c7a339', atendida: '#4f9d69', no_realizada: '#c1443a', vencida: '#c1443a' };
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

  const estado = datos ? estadoEfectivoLimpieza(datos) : null;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #fffdf8 0%, #f6ecd0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {loading ? (
          <div style={{ color: '#6b6555' }}>Consultando…</div>
        ) : error ? (
          <div style={{ textAlign: 'center' }}>
            <img src="/oroexpress-logo.webp" alt="Oroexpress" style={{ height: 32, marginBottom: 20 }} />
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#17213a' }}>No encontramos ese código</h1>
            <p style={{ color: '#6b6555', fontSize: 13.5, marginTop: 10 }}>{error}</p>
            <Link
              href="/limpieza"
              style={{
                display: 'inline-block', marginTop: 20, textDecoration: 'none', background: '#c7a339', color: '#1a1200',
                borderRadius: 10, padding: '10px 18px', fontSize: 13.5, fontWeight: 700,
              }}
            >
              Pedir un código nuevo
            </Link>
          </div>
        ) : estado === 'atendida' ? (
          <FichaLimpiezaCard limpieza={datos} />
        ) : (
          // Sin ficha todavía (pendiente, no realizada o vencida): mismo estilo
          // de tarjeta, sin los datos de la joya que aún no existen.
          <div style={{ border: '1px solid #e2dcca', borderRadius: 12, overflow: 'hidden', maxWidth: 420, width: '100%', background: '#fff' }}>
            <div style={{ background: 'linear-gradient(135deg, #12151c, #2a3242)', padding: '22px 20px 28px', textAlign: 'center' }}>
              <div style={{ display: 'inline-block', background: '#fff', borderRadius: 6, padding: '5px 10px' }}>
                <img src="/oroexpress-logo.webp" alt="Oroexpress" style={{ height: 22, display: 'block' }} />
              </div>
              <div style={{ color: '#c7a339', fontSize: 10.5, letterSpacing: 0.5, marginTop: 6 }}>MANTENIMIENTO GRATIS</div>
              <div style={{ color: '#fff', fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 700, marginTop: 16 }}>{datos.codigo}</div>
            </div>
            <div style={{ padding: '22px 24px', textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-block', padding: '5px 16px', borderRadius: 99, fontSize: 12.5, fontWeight: 700,
                  color: ESTADO_COLOR[estado], background: '#f6f4ef', marginBottom: 18,
                }}
              >
                {ESTADO_TEXTO[estado]}
              </div>
              <div style={{ fontSize: 10, color: '#6b6555' }}>SUCURSAL</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Oroexpress {datos.sucursal}</div>
              <div style={{ fontSize: 10, color: '#6b6555' }}>REGISTRADO EL</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtFechaCorta(datos.fechaRegistro)}</div>
              {estado === 'pendiente' && (
                <div style={{ fontSize: 11.5, color: '#9a927c', marginTop: 14 }}>Válido hasta el {fmtFechaLarga(datos.fechaLimite)} en cualquier joyería Oroexpress.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

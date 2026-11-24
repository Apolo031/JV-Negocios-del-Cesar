'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { BRANCHES } from '@/lib/dataHelpers';
import { SUCURSAL_INFO, distanciaKm } from '@/lib/sucursalesInfo';

const SUCURSALES = BRANCHES.map((b) => ({ sucursal: b, ...SUCURSAL_INFO[b] })).sort((a, b) => a.ciudad.localeCompare(b.ciudad, 'es'));
const CIUDADES = [...new Set(SUCURSALES.map((s) => s.ciudad))].sort((a, b) => a.localeCompare(b, 'es'));

function fmtFechaLarga(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(d, 10)} ${MESES[parseInt(m, 10) - 1]} ${y}`;
}

export default function LimpiezaLandingPage() {
  const [sucursal, setSucursal] = useState(null);
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null); // { codigo, qr }

  const [ciudadFiltro, setCiudadFiltro] = useState('');
  const [ubicacion, setUbicacion] = useState(null); // { lat, lng }
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [geoError, setGeoError] = useState('');

  function usarMiUbicacion() {
    if (!navigator.geolocation) { setGeoError('Tu navegador no permite compartir ubicación.'); return; }
    setBuscandoUbicacion(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUbicacion({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setCiudadFiltro(''); setBuscandoUbicacion(false); },
      () => { setGeoError('No pudimos obtener tu ubicación — elige tu ciudad de la lista.'); setBuscandoUbicacion(false); },
      { timeout: 8000 }
    );
  }

  const sucursalesOrdenadas = useMemo(() => {
    let lista = ciudadFiltro ? SUCURSALES.filter((s) => s.ciudad === ciudadFiltro) : SUCURSALES;
    if (ubicacion) {
      lista = lista
        .map((s) => ({ ...s, distancia: distanciaKm(ubicacion.lat, ubicacion.lng, s.lat, s.lng) }))
        .sort((a, b) => a.distancia - b.distancia);
    }
    return lista;
  }, [ciudadFiltro, ubicacion]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!nombreCliente.trim() || !telefono.trim()) return;
    setEnviando(true);
    setError('');
    try {
      const res = await fetch('/api/limpieza-registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreCliente, telefono, sucursal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar la solicitud.');
      const url = `${window.location.origin}/limpieza/${data.codigo}`;
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#17213a', light: '#ffffff' } });
      setResultado({ codigo: data.codigo, qr, fechaLimite: data.fechaLimite });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-shell" style={{ alignItems: 'flex-start', paddingTop: 48 }}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        {!resultado ? (
          <>
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, background: 'linear-gradient(160deg, #fffdf8 55%, #f6ecd0 100%)', padding: '38px 30px 32px', marginBottom: 28, border: '1px solid #e8dfc2' }}>
              <svg style={{ position: 'absolute', top: -22, left: -22, width: 150, height: 150, pointerEvents: 'none' }} viewBox="0 0 150 150" aria-hidden="true">
                <path d="M12,138 A126,126 0 0,1 138,12" fill="none" stroke="#c7a339" strokeWidth="2" opacity="0.55" />
              </svg>
              <svg style={{ position: 'absolute', bottom: -50, right: -50, width: 230, height: 230, pointerEvents: 'none' }} viewBox="0 0 230 230" aria-hidden="true">
                <circle cx="115" cy="115" r="115" fill="#12151c" opacity="0.055" />
              </svg>

              <div style={{ position: 'relative' }}>
                <div style={{ color: '#c7a339', fontSize: 22, marginBottom: 4 }}>✦</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, color: '#6b6555' }}>Obtén una</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 42, lineHeight: 1.05, color: '#17213a' }}>Limpieza</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontStyle: 'italic', fontSize: 42, lineHeight: 1.15, color: '#a9812a' }}>Gratis</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, color: '#6b6555', marginBottom: 20 }}>de tus joyas</div>

                <div style={{ width: 54, height: 2, background: '#c7a339', marginBottom: 18 }} />

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 16 }}>📍</span>
                  <p style={{ fontSize: 14, color: '#262319', lineHeight: 1.5, margin: 0 }}>
                    Escoge la joyería más cercana de ti y obtén una limpieza de tus joyas <b style={{ color: '#a9812a' }}>gratis</b>.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>1. Escoge la joyería más cercana</div>

            <div style={{ fontSize: 11.5, color: 'var(--text-dimmer)', marginBottom: 6 }}>Tu ciudad</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
              <select
                value={ciudadFiltro}
                onChange={(e) => { setCiudadFiltro(e.target.value); setUbicacion(null); }}
                style={{ minWidth: 200 }}
              >
                <option value="">Escoge una ciudad…</option>
                {CIUDADES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn-outline" type="button" onClick={usarMiUbicacion} disabled={buscandoUbicacion}>
                {buscandoUbicacion ? 'Ubicando…' : '📍 Usar mi ubicación'}
              </button>
            </div>
            {geoError && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 14 }}>{geoError}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 28 }}>
              {sucursalesOrdenadas.map((s) => (
                <button
                  key={s.sucursal} type="button" onClick={() => setSucursal(s.sucursal)}
                  style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${sucursal === s.sucursal ? 'var(--gold)' : 'var(--border)'}`,
                    background: sucursal === s.sucursal ? 'rgba(199,163,57,0.12)' : 'var(--surface)',
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: sucursal === s.sucursal ? 'var(--gold-light)' : 'var(--text)' }}>
                    Oroexpress {s.sucursal}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>
                    {s.ciudad}{s.distancia != null ? ` · a ${s.distancia.toFixed(0)} km` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginTop: 4 }}>{s.direccion}</div>
                </button>
              ))}
            </div>

            {sucursal && (
              <form onSubmit={handleSubmit}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>2. Tus datos</div>
                <label htmlFor="nombre" style={{ display: 'block', fontSize: 11.5, color: 'var(--text-dimmer)', marginBottom: 6 }}>Nombre completo</label>
                <input id="nombre" type="text" required value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} style={{ width: '100%', marginBottom: 16 }} />
                <label htmlFor="telefono" style={{ display: 'block', fontSize: 11.5, color: 'var(--text-dimmer)', marginBottom: 6 }}>Teléfono celular</label>
                <input id="telefono" type="tel" required value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="300 123 4567" style={{ width: '100%' }} />
                {error && <div className="login-error">{error}</div>}
                <button className="btn" type="submit" disabled={enviando} style={{ width: '100%', marginTop: 22 }}>
                  {enviando ? 'Enviando…' : 'Obtener mi código gratis'}
                </button>
              </form>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}>
              <div style={{ background: 'var(--gold)', height: 10 }} />
              <div style={{ padding: '26px 28px 22px', textAlign: 'center' }}>
                <img src="/oroexpress-logo.webp" alt="Oroexpress" style={{ height: 36, margin: '0 auto 22px' }} />
                <div style={{ color: '#6b6555', fontSize: 13 }}>Obtén una</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 34, color: '#17213a', lineHeight: 1.1 }}>Limpieza</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontStyle: 'italic', fontSize: 34, color: '#a9812a', lineHeight: 1.15 }}>Gratis</div>
                <div style={{ color: '#6b6555', fontSize: 13, marginTop: 2 }}>de tus joyas</div>
              </div>

              <div style={{ background: '#17213a', padding: '14px 28px', textAlign: 'center' }}>
                <div style={{ color: '#9fb0cc', fontSize: 11, letterSpacing: 1, fontWeight: 600 }}>TU CÓDIGO</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 28, color: '#e8cd7a', marginTop: 4 }}>{resultado.codigo}</div>
              </div>

              <div style={{ padding: '22px 28px', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#17213a' }}>{nombreCliente}</div>
                <div style={{ color: '#6b6555', fontSize: 13, marginTop: 10, lineHeight: 1.6 }}>
                  Válido hasta el {fmtFechaLarga(resultado.fechaLimite)}<br />
                  <b>En cualquier joyería Oroexpress</b>
                </div>

                <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #e2dcca' }}>
                  <div style={{ fontSize: 12.5, color: '#262319' }}>
                    Joyería elegida: <b>OROEXPRESS {sucursal?.toUpperCase()}</b>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b6555', marginTop: 2 }}>{SUCURSAL_INFO[sucursal]?.direccion}</div>
                  <div style={{ fontSize: 11, color: '#9a927c', marginTop: 6 }}>
                    ¿Te queda otra más cerca? No hay problema, puedes acercarte a cualquiera de nuestras joyerías.
                  </div>
                </div>

                <img src={resultado.qr} alt="Código QR" width={110} height={110} style={{ marginTop: 18 }} />
                <div style={{ fontSize: 10.5, color: '#9a927c', marginTop: 4 }}>Escanea para ver el estado de tu código</div>
              </div>

              <div style={{ background: 'var(--gold)', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: '#1a1200', padding: '12px 0' }}>
                Presenta este código en la joyería
              </div>
            </div>

            <p style={{ color: 'var(--text-dimmer)', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
              Guarda una captura de pantalla — también puedes volver a <Link href={`/limpieza/${resultado.codigo}`} style={{ color: 'var(--gold-light)' }}>esta página</Link> cuando quieras para ver el estado.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { BRANCHES } from '@/lib/dataHelpers';
import { SUCURSAL_INFO, distanciaKm } from '@/lib/sucursalesInfo';

const SUCURSALES = BRANCHES.map((b) => ({ sucursal: b, ...SUCURSAL_INFO[b] })).sort((a, b) => a.ciudad.localeCompare(b.ciudad, 'es'));
const CIUDADES = [...new Set(SUCURSALES.map((s) => s.ciudad))].sort((a, b) => a.localeCompare(b, 'es'));

// Paleta fija de marca para toda esta página pública (no usa variables de
// tema de la app): debe verse igual sin importar el modo claro/oscuro de
// quien la vea, como cualquier documento de cara al cliente.
const NAVY = '#17213a';
const NAVY_DEEP = '#12151c';
const GOLD = '#c7a339';
const GOLD_LIGHT = '#e8cd7a';
const GOLD_DEEP = '#a9812a';
const CREAM = '#fffefb';
const BORDER = '#e2dcca';
const TEXT = '#262319';
const TEXT_DIM = '#6b6555';
const TEXT_DIMMER = '#9a927c';
const RED = '#c1443a';

const inputStyle = {
  width: '100%', border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px',
  background: CREAM, color: TEXT, fontSize: 14, fontFamily: 'inherit',
};

function fmtFechaLarga(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(d, 10)} ${MESES[parseInt(m, 10) - 1]} ${y}`;
}

function PasoTitulo({ n, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', background: GOLD, color: '#1a1200',
        fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{n}</div>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 700, color: NAVY }}>{children}</div>
    </div>
  );
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
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: NAVY, light: '#ffffff' } });
      setResultado({ codigo: data.codigo, qr, fechaLimite: data.fechaLimite });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(160deg, #fffdf8 0%, #f6ecd0 100%)`, padding: '48px 20px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 640, position: 'relative' }}>
        <svg style={{ position: 'absolute', top: -30, left: -30, width: 170, height: 170, pointerEvents: 'none' }} viewBox="0 0 170 170" aria-hidden="true">
          <path d="M14,156 A142,142 0 0,1 156,14" fill="none" stroke={GOLD} strokeWidth="2" opacity="0.5" />
        </svg>
        <svg style={{ position: 'absolute', bottom: -60, right: -60, width: 260, height: 260, pointerEvents: 'none' }} viewBox="0 0 260 260" aria-hidden="true">
          <circle cx="130" cy="130" r="130" fill={NAVY_DEEP} opacity="0.05" />
        </svg>

        <div style={{ position: 'relative' }}>
          {!resultado ? (
            <>
              <div style={{ padding: '10px 2px 32px', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
                <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                  <div style={{ color: GOLD, fontSize: 22, marginBottom: 4 }}>✦</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, color: TEXT_DIM }}>Obtén una</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 42, lineHeight: 1.05, color: NAVY }}>Limpieza</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontStyle: 'italic', fontSize: 42, lineHeight: 1.15, color: GOLD_DEEP }}>Gratis</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, color: TEXT_DIM, marginBottom: 20 }}>de tus joyas</div>

                  <div style={{ width: 54, height: 2, background: GOLD, marginBottom: 18 }} />

                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 16 }}>📍</span>
                    <p style={{ fontSize: 14, color: TEXT, lineHeight: 1.5, margin: 0 }}>
                      Escoge la joyería más cercana de ti y obtén una limpieza de tus joyas <b style={{ color: GOLD_DEEP }}>gratis</b>.
                    </p>
                  </div>
                </div>

                <div style={{ flex: '0 1 220px', minWidth: 180, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ position: 'relative', width: '100%', maxWidth: 240, borderRadius: 16, overflow: 'hidden', border: `1px solid ${BORDER}`, boxShadow: '0 10px 28px rgba(23,33,58,0.12)' }}>
                    <img
                      src="/limpieza-hero.jpg"
                      alt="Joya limpiada por Oroexpress"
                      style={{ display: 'block', width: '100%', height: 200, objectFit: 'cover' }}
                    />
                    <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 15, color: GOLD_LIGHT, textShadow: '0 1px 3px rgba(0,0,0,0.35)' }}>✦</div>
                  </div>
                </div>
              </div>

              <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 18, padding: '26px 24px 30px', marginBottom: 20 }}>
                <PasoTitulo n={1}>Escoge la joyería más cercana</PasoTitulo>

                <div style={{ fontSize: 11.5, color: TEXT_DIMMER, marginBottom: 6 }}>Tu ciudad</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                  <select
                    value={ciudadFiltro}
                    onChange={(e) => { setCiudadFiltro(e.target.value); setUbicacion(null); }}
                    style={{ ...inputStyle, minWidth: 200, width: 'auto' }}
                  >
                    <option value="">Escoge una ciudad…</option>
                    {CIUDADES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button
                    type="button" onClick={usarMiUbicacion} disabled={buscandoUbicacion}
                    style={{
                      border: `1.5px solid ${GOLD}`, color: GOLD_DEEP, background: 'transparent',
                      borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {buscandoUbicacion ? 'Ubicando…' : '📍 Usar mi ubicación'}
                  </button>
                </div>
                {geoError && <div style={{ fontSize: 12, color: RED, marginBottom: 14 }}>{geoError}</div>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                  {sucursalesOrdenadas.map((s) => (
                    <button
                      key={s.sucursal} type="button" onClick={() => setSucursal(s.sucursal)}
                      style={{
                        textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                        border: `1.5px solid ${sucursal === s.sucursal ? GOLD : BORDER}`,
                        background: sucursal === s.sucursal ? 'rgba(199,163,57,0.12)' : '#fff',
                      }}
                    >
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: sucursal === s.sucursal ? GOLD_DEEP : NAVY }}>
                        Oroexpress {s.sucursal}
                      </div>
                      <div style={{ fontSize: 11.5, color: TEXT_DIM, marginTop: 2 }}>
                        {s.ciudad}{s.distancia != null ? ` · a ${s.distancia.toFixed(0)} km` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: TEXT_DIMMER, marginTop: 4 }}>{s.direccion}</div>
                    </button>
                  ))}
                </div>
              </div>

              {sucursal && (
                <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 18, padding: '26px 24px 30px' }}>
                  <PasoTitulo n={2}>Tus datos</PasoTitulo>
                  <form onSubmit={handleSubmit}>
                    <label htmlFor="nombre" style={{ display: 'block', fontSize: 11.5, color: TEXT_DIMMER, marginBottom: 6 }}>Nombre completo</label>
                    <input id="nombre" type="text" required value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />
                    <label htmlFor="telefono" style={{ display: 'block', fontSize: 11.5, color: TEXT_DIMMER, marginBottom: 6 }}>Teléfono celular</label>
                    <input id="telefono" type="tel" required value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="300 123 4567" style={inputStyle} />
                    {error && <div style={{ color: RED, fontSize: 12.5, marginTop: 14 }}>{error}</div>}
                    <button
                      type="submit" disabled={enviando}
                      style={{
                        width: '100%', marginTop: 22, background: GOLD, color: '#1a1200', border: 'none',
                        borderRadius: 10, padding: '12px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {enviando ? 'Enviando…' : 'Obtener mi código gratis'}
                    </button>
                  </form>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10 }}>
              <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}>
                <div style={{ background: GOLD, height: 10 }} />
                <div style={{ padding: '26px 28px 22px', textAlign: 'center' }}>
                  <img src="/oroexpress-logo.webp" alt="Oroexpress" style={{ height: 36, margin: '0 auto 22px' }} />
                  <div style={{ color: TEXT_DIM, fontSize: 13 }}>Obtén una</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 34, color: NAVY, lineHeight: 1.1 }}>Limpieza</div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontStyle: 'italic', fontSize: 34, color: GOLD_DEEP, lineHeight: 1.15 }}>Gratis</div>
                  <div style={{ color: TEXT_DIM, fontSize: 13, marginTop: 2 }}>de tus joyas</div>
                </div>

                <div style={{ background: NAVY, padding: '14px 28px', textAlign: 'center' }}>
                  <div style={{ color: '#9fb0cc', fontSize: 11, letterSpacing: 1, fontWeight: 600 }}>TU CÓDIGO</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 28, color: GOLD_LIGHT, marginTop: 4 }}>{resultado.codigo}</div>
                </div>

                <div style={{ padding: '22px 28px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 18, color: NAVY }}>{nombreCliente}</div>
                  <div style={{ color: TEXT_DIM, fontSize: 13, marginTop: 10, lineHeight: 1.6 }}>
                    Válido hasta el {fmtFechaLarga(resultado.fechaLimite)}<br />
                    <b>En cualquier joyería Oroexpress</b>
                  </div>

                  <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 12.5, color: TEXT }}>
                      Joyería elegida: <b>OROEXPRESS {sucursal?.toUpperCase()}</b>
                    </div>
                    <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 2 }}>{SUCURSAL_INFO[sucursal]?.direccion}</div>
                    <div style={{ fontSize: 11, color: TEXT_DIMMER, marginTop: 6 }}>
                      ¿Te queda otra más cerca? No hay problema, puedes acercarte a cualquiera de nuestras joyerías.
                    </div>
                  </div>

                  <img src={resultado.qr} alt="Código QR" width={110} height={110} style={{ marginTop: 18 }} />
                  <div style={{ fontSize: 10.5, color: TEXT_DIMMER, marginTop: 4 }}>Escanea para ver el estado de tu código</div>
                </div>

                <div style={{ background: GOLD, textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: '#1a1200', padding: '12px 0' }}>
                  Presenta este código en la joyería
                </div>
              </div>

              <p style={{ color: TEXT_DIMMER, fontSize: 12, marginTop: 20, textAlign: 'center' }}>
                Guarda una captura de pantalla — también puedes volver a <Link href={`/limpieza/${resultado.codigo}`} style={{ color: GOLD_DEEP }}>esta página</Link> cuando quieras para ver el estado.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { BRANCHES } from '@/lib/dataHelpers';
import { SUCURSAL_INFO, distanciaKm } from '@/lib/sucursalesInfo';

const SUCURSALES = BRANCHES.map((b) => ({ sucursal: b, ...SUCURSAL_INFO[b] })).sort((a, b) => a.ciudad.localeCompare(b.ciudad, 'es'));
const CIUDADES = [...new Set(SUCURSALES.map((s) => s.ciudad))].sort((a, b) => a.localeCompare(b, 'es'));

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
      setResultado({ codigo: data.codigo, qr });
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
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 32, lineHeight: 1.25, color: 'var(--text)' }}>
              Obtén una limpieza <i style={{ color: 'var(--gold-light)' }}>gratis</i> de tus joyas
            </h1>
            <p style={{ color: 'var(--text-dim)', fontSize: 14.5, marginTop: 10, marginBottom: 32 }}>
              Pide tu código, llévalo a cualquiera de nuestras joyerías y te limpiamos tus joyas sin costo.
            </p>

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
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 26, color: 'var(--text)' }}>¡Listo, {nombreCliente.split(' ')[0]}!</h1>
            <p style={{ color: 'var(--text-dim)', fontSize: 14, marginTop: 8, marginBottom: 24 }}>
              Preséntate en <b>{sucursal}</b> con este código para tu limpieza gratis.
            </p>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, display: 'inline-block' }}>
              <img src={resultado.qr} alt="Código QR" width={200} height={200} style={{ borderRadius: 8 }} />
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 700, letterSpacing: 1, color: 'var(--gold-light)', marginTop: 14 }}>
                {resultado.codigo}
              </div>
            </div>
            <p style={{ color: 'var(--text-dimmer)', fontSize: 12, marginTop: 20 }}>
              Guarda una captura de pantalla — también puedes volver a <Link href={`/limpieza/${resultado.codigo}`} style={{ color: 'var(--gold-light)' }}>esta página</Link> cuando quieras para ver el estado.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

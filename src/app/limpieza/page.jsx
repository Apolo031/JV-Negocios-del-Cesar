'use client';

import { useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { BRANCHES } from '@/lib/dataHelpers';

export default function LimpiezaLandingPage() {
  const [sucursal, setSucursal] = useState(null);
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null); // { codigo, qr }

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

            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>1. Escoge tu sucursal</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 28 }}>
              {BRANCHES.map((b) => (
                <button
                  key={b} type="button" onClick={() => setSucursal(b)}
                  style={{
                    padding: '14px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 13.5, fontWeight: 600,
                    border: `1.5px solid ${sucursal === b ? 'var(--gold)' : 'var(--border)'}`,
                    background: sucursal === b ? 'rgba(199,163,57,0.12)' : 'var(--surface)',
                    color: sucursal === b ? 'var(--gold-light)' : 'var(--text)',
                  }}
                >
                  {b}
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { BRANCHES } from '@/lib/dataHelpers';
import {
  CATEGORIAS_JOYA, METALES_JOYA, KILATAJES_ORO,
  normalizarCodigo, estadoEfectivoLimpieza,
} from '@/lib/limpiezaHelpers';

function fmtFechaCorta(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const ESTADO_PILL = { pendiente: 'neu', atendida: 'pos', no_realizada: 'neg', vencida: 'neg' };
const ESTADO_TEXTO = { pendiente: 'Pendiente', atendida: 'Atendida', no_realizada: 'No realizada', vencida: 'Vencida' };

/** Dibuja la ficha en un canvas y dispara la descarga como PNG — sin librerías extra, con Canvas 2D nativo. */
async function descargarFichaPNG(limpieza) {
  const W = 640, H = 820;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Fondo
  ctx.fillStyle = '#f6f4ef';
  ctx.fillRect(0, 0, W, H);

  // Encabezado degradado
  const grad = ctx.createLinearGradient(0, 0, W, 300);
  grad.addColorStop(0, '#12151c');
  grad.addColorStop(1, '#2a3242');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 300);

  try {
    const logo = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = '/oroexpress-logo.webp';
    });
    const logoH = 34;
    ctx.drawImage(logo, 32, 20, logoH * (logo.width / logo.height), logoH);
  } catch {
    ctx.fillStyle = '#e8cd7a';
    ctx.font = '700 22px Arial';
    ctx.fillText('JOYERÍA OROEXPRESS', 32, 50);
  }
  ctx.font = '600 12px Arial';
  ctx.fillStyle = '#c7a339';
  ctx.fillText('COMPRAVENTA Y JOYERÍA · LIMPIEZA GRATIS', 32, 78);

  // Foto (si hay)
  if (limpieza.fotoUrl) {
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = limpieza.fotoUrl;
      });
      const size = 150;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(W - size - 32, 40, size, size, 10);
      ctx.clip();
      const ratio = Math.max(size / img.width, size / img.height);
      ctx.drawImage(img, W - size - 32 - (img.width * ratio - size) / 2, 40 - (img.height * ratio - size) / 2, img.width * ratio, img.height * ratio);
      ctx.restore();
      ctx.strokeStyle = '#e8cd7a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(W - size - 32, 40, size, size, 10);
      ctx.stroke();
    } catch {
      // si la imagen no carga (CORS u otro), se omite sin romper la descarga
    }
  }

  ctx.fillStyle = '#e8cd7a';
  ctx.font = '700 30px Arial';
  const linea1 = [limpieza.categoria, limpieza.metal, limpieza.kilataje].filter(Boolean).join(' · ');
  ctx.fillText(linea1 || '—', 32, 140);
  if (limpieza.pesoGramos) {
    ctx.font = '700 22px Arial';
    ctx.fillText(`${limpieza.pesoGramos} g`, 32, 175);
  }
  ctx.font = '600 20px "Courier New", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(limpieza.codigo, 32, 220);

  ctx.font = '11px Arial';
  ctx.fillStyle = '#8d96ac';
  ctx.fillText('TITULAR', 32, 255);
  ctx.font = '700 16px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(limpieza.nombreCliente, 32, 275);

  ctx.font = '11px Arial';
  ctx.fillStyle = '#8d96ac';
  ctx.fillText('LIMPIEZA', W - 170, 255);
  ctx.font = '700 16px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fmtFechaCorta(limpieza.fechaAtencion), W - 170, 275);

  // Reverso
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 300, W, H - 300);
  ctx.strokeStyle = '#e2dcca';
  ctx.strokeRect(0, 300, W, H - 300);

  try {
    const qrDataUrl = await QRCode.toDataURL(`${window.location.origin}/limpieza/${limpieza.codigo}`, { margin: 1, width: 180 });
    const qrImg = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = qrDataUrl;
    });
    ctx.drawImage(qrImg, 32, 332, 180, 180);
  } catch {
    // si el QR no se pudo generar, se sigue sin él
  }

  ctx.fillStyle = '#262319';
  ctx.font = '11px Arial';
  ctx.fillText('JOYERÍA', 240, 350);
  ctx.font = '700 16px Arial';
  ctx.fillText(`OROEXPRESS ${(limpieza.sucursal || '').toUpperCase()}`, 240, 372);

  ctx.font = '11px Arial';
  ctx.fillStyle = '#6b6555';
  ctx.fillText('CLIENTE', 240, 410);
  ctx.font = '700 15px Arial';
  ctx.fillStyle = '#262319';
  ctx.fillText(limpieza.esClienteNuevo ? 'Nuevo' : 'Ya era cliente', 240, 430);

  if (limpieza.observacion) {
    ctx.font = '11px Arial';
    ctx.fillStyle = '#6b6555';
    ctx.fillText('OBSERVACIONES', 240, 466);
    ctx.font = '600 14px Arial';
    ctx.fillStyle = '#262319';
    ctx.fillText(limpieza.observacion.slice(0, 48), 240, 486);
  }

  ctx.fillStyle = '#e8cd7a';
  ctx.fillRect(0, H - 50, W, 50);
  ctx.fillStyle = '#12151c';
  ctx.font = '700 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Gracias por confiar en Oroexpress', W / 2, H - 22);
  ctx.textAlign = 'left';

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ficha_${limpieza.codigo}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

function enlaceWhatsApp(limpieza) {
  const telefono = (limpieza.telefono || '').replace(/\D/g, '');
  const url = `${window.location.origin}/limpieza/${limpieza.codigo}`;
  const texto = encodeURIComponent(
    `¡Hola ${limpieza.nombreCliente.split(' ')[0]}! Tu joya (${[limpieza.categoria, limpieza.metal, limpieza.kilataje].filter(Boolean).join(' ')}) ya quedó limpia en Oroexpress ${limpieza.sucursal}. Aquí está tu ficha: ${url}`
  );
  return `https://wa.me/${telefono}?text=${texto}`;
}

// Colores fijos de marca (no las variables de tema de la app): esta tarjeta
// representa un documento para el cliente, así que debe verse igual sin
// importar si quien la generó tiene el panel en modo claro u oscuro.
function FichaCard({ limpieza }) {
  return (
    <div style={{ border: '1px solid #e2dcca', borderRadius: 12, overflow: 'hidden', maxWidth: 420, background: '#fff' }}>
      <div style={{ background: 'linear-gradient(135deg, #12151c, #2a3242)', padding: '20px 20px 60px' }}>
        <img src="/oroexpress-logo.webp" alt="Oroexpress" style={{ height: 24, marginBottom: 12 }} />
        <div style={{ color: '#c7a339', fontSize: 10.5, letterSpacing: 0.5, marginTop: -8 }}>COMPRAVENTA Y JOYERÍA · LIMPIEZA GRATIS</div>
        {limpieza.fotoUrl && (
          <img src={limpieza.fotoUrl} alt="Foto de la joya" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '2px solid #e8cd7a', float: 'right', marginTop: -36 }} />
        )}
        <div style={{ color: '#e8cd7a', fontWeight: 700, fontSize: 22, marginTop: 20 }}>
          {[limpieza.categoria, limpieza.metal, limpieza.kilataje].filter(Boolean).join(' · ') || '—'}
          {limpieza.pesoGramos ? ` · ${limpieza.pesoGramos} g` : ''}
        </div>
        <div style={{ color: '#fff', fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, marginTop: 10 }}>{limpieza.codigo}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: '#8d96ac' }}>TITULAR</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{limpieza.nombreCliente}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#8d96ac' }}>LIMPIEZA</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fmtFechaCorta(limpieza.fechaAtencion)}</div>
          </div>
        </div>
      </div>
      <div style={{ background: '#fff', color: '#262319', padding: 20 }}>
        <div style={{ fontSize: 10, color: '#6b6555' }}>JOYERÍA</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>OROEXPRESS {(limpieza.sucursal || '').toUpperCase()}</div>
        <div style={{ fontSize: 10, color: '#6b6555' }}>CLIENTE</div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: limpieza.observacion ? 10 : 0 }}>{limpieza.esClienteNuevo ? 'Nuevo' : 'Ya era cliente'}</div>
        {limpieza.observacion && (
          <>
            <div style={{ fontSize: 10, color: '#6b6555' }}>OBSERVACIONES</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{limpieza.observacion}</div>
          </>
        )}
      </div>
      <div style={{ background: '#c7a339', color: '#1a1200', textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '10px 0' }}>
        Gracias por confiar en Oroexpress
      </div>
    </div>
  );
}

function CompletarFicha({ limpieza, onGuardado }) {
  const { user } = useAuth();
  const [esClienteNuevo, setEsClienteNuevo] = useState('nuevo');
  const [categoria, setCategoria] = useState(CATEGORIAS_JOYA[0]);
  const [metal, setMetal] = useState(METALES_JOYA[0]);
  const [kilataje, setKilataje] = useState(KILATAJES_ORO[2]);
  const [pesoGramos, setPesoGramos] = useState('');
  const [observacion, setObservacion] = useState('');
  const [foto, setFoto] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function handleGuardar() {
    if (!pesoGramos || Number(pesoGramos) <= 0) { setError('Ingresa el peso en gramos.'); return; }
    setGuardando(true);
    setError('');
    try {
      let fotoUrl = null;
      if (foto) {
        const path = `limpiezas/${limpieza.codigo}/${Date.now()}-${foto.name}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, foto, { contentType: foto.type });
        fotoUrl = await getDownloadURL(fileRef);
      }
      await updateDoc(doc(db, 'limpiezas', limpieza.id), {
        estado: 'atendida', esClienteNuevo: esClienteNuevo === 'nuevo',
        categoria, metal, kilataje: metal === 'Oro' ? kilataje : null,
        pesoGramos: Number(pesoGramos), observacion: observacion.trim() || null,
        fotoUrl, atendidoPor: user?.email || null, fechaAtencion: Date.now(),
      });
      onGuardado?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function handleNoRealizada() {
    setGuardando(true);
    try {
      await updateDoc(doc(db, 'limpiezas', limpieza.id), { estado: 'no_realizada', fechaAtencion: Date.now(), atendidoPor: user?.email || null });
      onGuardado?.();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>¿Es cliente nuevo?</div>
          <select value={esClienteNuevo} onChange={(e) => setEsClienteNuevo(e.target.value)}>
            <option value="nuevo">Cliente nuevo</option>
            <option value="existente">Ya era cliente</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Categoría</div>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS_JOYA.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Metal</div>
          <select value={metal} onChange={(e) => setMetal(e.target.value)}>
            {METALES_JOYA.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        {metal === 'Oro' && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Kilataje</div>
            <select value={kilataje} onChange={(e) => setKilataje(e.target.value)}>
              {KILATAJES_ORO.map((k) => <option key={k}>{k}</option>)}
            </select>
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Peso (gramos)</div>
          <input type="number" step="0.1" min="0" value={pesoGramos} onChange={(e) => setPesoGramos(e.target.value)} style={{ width: 90 }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Observación (opcional)</div>
          <input type="text" value={observacion} onChange={(e) => setObservacion(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Foto de la joya</div>
          <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
        </div>
      </div>
      {error && <div className="login-error">{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" type="button" onClick={handleGuardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Marcar como atendida y generar ficha'}
        </button>
        <button className="btn-outline" type="button" onClick={handleNoRealizada} disabled={guardando} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          Marcar como no realizada
        </button>
      </div>
    </div>
  );
}

function BuscarCodigo({ limpiezas, isAdmin }) {
  const [codigoInput, setCodigoInput] = useState('');
  const [codigoActivo, setCodigoActivo] = useState(null);
  const [mensaje, setMensaje] = useState('');

  const encontrada = codigoActivo ? limpiezas.find((l) => normalizarCodigo(l.codigo) === codigoActivo) : null;

  function buscar() {
    const c = normalizarCodigo(codigoInput);
    if (!c) return;
    if (!limpiezas.some((l) => normalizarCodigo(l.codigo) === c)) {
      setMensaje('No se encontró ese código.');
      setCodigoActivo(null);
      return;
    }
    setMensaje('');
    setCodigoActivo(c);
  }

  async function handleReabrir() {
    await updateDoc(doc(db, 'limpiezas', encontrada.id), { estado: 'pendiente', atendidoPor: null, fechaAtencion: null });
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Buscar código</h3></div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          type="text" value={codigoInput} onChange={(e) => setCodigoInput(e.target.value)} placeholder="LIM-XXXX-XXXX"
          onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }} style={{ maxWidth: 240, fontFamily: "'IBM Plex Mono', monospace" }}
        />
        <button className="btn" type="button" onClick={buscar}>Buscar</button>
      </div>
      {mensaje && <div className="login-error">{mensaje}</div>}
      {encontrada && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <span className={`pill ${ESTADO_PILL[estadoEfectivoLimpieza(encontrada)]}`}>{ESTADO_TEXTO[estadoEfectivoLimpieza(encontrada)]}</span>
            <b>{encontrada.nombreCliente}</b>
            <span style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>{encontrada.telefono} · {encontrada.sucursal} · Registrado {fmtFechaCorta(encontrada.fechaRegistro)}</span>
          </div>

          {encontrada.estado === 'pendiente' && <CompletarFicha limpieza={encontrada} onGuardado={() => {}} />}

          {encontrada.estado === 'atendida' && (
            <div>
              <FichaCard limpieza={encontrada} />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <a className="btn" href={enlaceWhatsApp(encontrada)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', background: 'var(--green)' }}>
                  Enviar por WhatsApp al cliente
                </a>
                <button className="btn-outline" type="button" onClick={() => descargarFichaPNG(encontrada)}>⭳ Descargar imagen</button>
                {isAdmin && <button className="btn-outline" type="button" onClick={handleReabrir}>Reabrir</button>}
              </div>
            </div>
          )}

          {encontrada.estado === 'no_realizada' && (
            <div>
              <div className="empty-note">Esta limpieza quedó marcada como no realizada.</div>
              {isAdmin && <button className="btn-outline" type="button" onClick={handleReabrir} style={{ marginTop: 10 }}>Reabrir</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function hace30Dias() {
  return new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function LimpiezasPedidas({ limpiezas, canEditar }) {
  const [desde, setDesde] = useState(hace30Dias());
  const [hasta, setHasta] = useState(hoyISO());
  const [sucursal, setSucursal] = useState('__ALL__');

  const filtradas = useMemo(() => {
    const desdeMs = new Date(desde).setHours(0, 0, 0, 0);
    const hastaMs = new Date(hasta).setHours(23, 59, 59, 999);
    return limpiezas.filter((l) => {
      if (l.fechaRegistro < desdeMs || l.fechaRegistro > hastaMs) return false;
      if (sucursal !== '__ALL__' && l.sucursal !== sucursal) return false;
      return true;
    });
  }, [limpiezas, desde, hasta, sucursal]);

  const stats = useMemo(() => {
    const pedidas = filtradas.length;
    const atendidas = filtradas.filter((l) => l.estado === 'atendida');
    const noRealizadas = filtradas.filter((l) => l.estado === 'no_realizada').length;
    const vencidas = filtradas.filter((l) => estadoEfectivoLimpieza(l) === 'vencida').length;
    const pendientes = filtradas.filter((l) => estadoEfectivoLimpieza(l) === 'pendiente').length;
    const gramosOro = atendidas.filter((l) => l.metal === 'Oro').reduce((s, l) => s + (l.pesoGramos || 0), 0);
    const gramosPlata = atendidas.filter((l) => l.metal === 'Plata').reduce((s, l) => s + (l.pesoGramos || 0), 0);
    const gramosOtro = atendidas.filter((l) => l.metal === 'Otro').reduce((s, l) => s + (l.pesoGramos || 0), 0);
    const clientesNuevos = atendidas.filter((l) => l.esClienteNuevo === true).length;
    const yaEranClientes = atendidas.filter((l) => l.esClienteNuevo === false).length;
    return {
      pedidas, atendidas: atendidas.length, joyasLimpiadas: atendidas.length,
      gramosLimpiados: gramosOro + gramosPlata + gramosOtro, pendientes, vencidas, noRealizadas,
      gramosOro, gramosPlata, gramosOtro, clientesNuevos, yaEranClientes,
    };
  }, [filtradas]);

  async function marcarNoRealizada(id) {
    await updateDoc(doc(db, 'limpiezas', id), { estado: 'no_realizada', fechaAtencion: Date.now() });
  }

  return (
    <div>
      <div className="panel">
        <div className="panel-head"><h3>Limpiezas pedidas</h3></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Desde</div>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Hasta</div>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Sucursal</div>
            <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
              <option value="__ALL__">Todas</option>
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          {[
            ['Pedidas', stats.pedidas], ['Atendidas', stats.atendidas], ['Joyas limpiadas', stats.joyasLimpiadas],
            ['Gramos limpiados', stats.gramosLimpiados.toFixed(1)], ['Pendientes', stats.pendientes],
            ['Vencidas', stats.vencidas], ['No realizadas', stats.noRealizadas],
          ].map(([label, value]) => (
            <div key={label} className="kpi"><div className="label">{label}</div><div className="value">{value}</div></div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginTop: 10 }}>
          {[
            ['Gramos de oro', `${stats.gramosOro.toFixed(1)} g`], ['Gramos de plata', `${stats.gramosPlata.toFixed(1)} g`],
            ['Gramos de otro metal', `${stats.gramosOtro.toFixed(1)} g`], ['Clientes nuevos', stats.clientesNuevos],
            ['Ya eran clientes', stats.yaEranClientes],
          ].map(([label, value]) => (
            <div key={label} className="kpi"><div className="label">{label}</div><div className="value">{value}</div></div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Registros</h3>
          <span className="hint">{filtradas.length} {filtradas.length === 1 ? 'registro' : 'registros'}</span>
        </div>
        {filtradas.length === 0 ? (
          <div className="empty-note">No hay registros en este rango.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Cliente</th><th>Sucursal</th><th>Código</th><th>Registrado</th>
                  <th>Estado</th><th>Joya</th><th>Gramos</th>{canEditar && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtradas.sort((a, b) => b.fechaRegistro - a.fechaRegistro).map((l) => (
                  <tr key={l.id}>
                    <td className="name">{l.nombreCliente}</td>
                    <td>{l.sucursal}</td>
                    <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5 }}>{l.codigo}</td>
                    <td>{fmtFechaCorta(l.fechaRegistro)}</td>
                    <td><span className={`pill ${ESTADO_PILL[estadoEfectivoLimpieza(l)]}`}>{ESTADO_TEXTO[estadoEfectivoLimpieza(l)]}</span></td>
                    <td>{[l.categoria, l.metal, l.kilataje].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{l.pesoGramos || '—'}</td>
                    {canEditar && (
                      <td>
                        {estadoEfectivoLimpieza(l) === 'pendiente' && (
                          <button className="btn-outline" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => marcarNoRealizada(l.id)}>No realizada</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LimpiezaGratisView({ canEditar, isAdmin }) {
  const [limpiezas, setLimpiezas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState('buscar');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'limpiezas'), (snap) => {
      setLimpiezas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn-toggle${sub === 'buscar' ? ' active' : ''}`} type="button" onClick={() => setSub('buscar')}>Buscar código</button>
        <button className={`btn-toggle${sub === 'pedidas' ? ' active' : ''}`} type="button" onClick={() => setSub('pedidas')}>Limpiezas pedidas</button>
      </div>
      {sub === 'buscar' ? <BuscarCodigo limpiezas={limpiezas} isAdmin={isAdmin} /> : <LimpiezasPedidas limpiezas={limpiezas} canEditar={canEditar} />}
    </div>
  );
}

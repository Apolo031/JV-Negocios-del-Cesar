'use client';

import { useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { fmtMoney, fmtGr } from '@/lib/dataHelpers';
import { slugifyId } from '@/lib/importHelpers';

const MAX_FOTO_BYTES = 8 * 1024 * 1024;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function IdentificarJoyaPage() {
  const { isAdmin, getIdToken } = useAuth();

  const [skuBusqueda, setSkuBusqueda] = useState('');
  const [pieza, setPieza] = useState(undefined); // undefined = no buscada, null = no encontrada (sin ligar a inventario)
  const [foto, setFoto] = useState(null); // {photo, identificacion} ya guardado para esta SKU
  const [buscando, setBuscando] = useState(false);
  const [identificando, setIdentificando] = useState(false);
  const [error, setError] = useState('');
  const camaraInputRef = useRef(null);
  const galeriaInputRef = useRef(null);

  async function buscarSku() {
    const sku = skuBusqueda.trim();
    if (!sku) { setPieza(undefined); setFoto(null); return; }
    setBuscando(true);
    setError('');
    try {
      const id = slugifyId(sku);
      const [snap, fotoSnap] = await Promise.all([
        getDoc(doc(db, 'inventario', id)),
        getDoc(doc(db, 'inventario_fotos', id)),
      ]);
      setPieza(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setFoto(fotoSnap.exists() ? fotoSnap.data() : null);
    } catch (err) {
      setError('No se pudo buscar el SKU: ' + err.message);
    } finally {
      setBuscando(false);
    }
  }

  async function handleIdentificarFoto(file) {
    if (!file) return;
    const sku = skuBusqueda.trim();
    if (!sku) { setError('Escribe primero el SKU de la pieza.'); return; }
    if (file.size > MAX_FOTO_BYTES) {
      setError('La foto pesa demasiado (máx. 8MB).');
      return;
    }
    setIdentificando(true);
    setError('');
    try {
      const id = slugifyId(sku);
      const path = `inventario/${id}/${Date.now()}-${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const src = await getDownloadURL(fileRef);
      const photo = { src, name: file.name, path, type: file.type };

      const imageBase64 = await readFileAsBase64(file);
      const token = await getIdToken();
      const res = await fetch('/api/identify-joya', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64, mimeType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo identificar la foto');

      const nuevo = { photo, identificacion: data.identificacion, identificadoEn: Date.now() };
      await setDoc(doc(db, 'inventario_fotos', id), nuevo);
      setFoto(nuevo);
    } catch (err) {
      setError(err.message);
    } finally {
      setIdentificando(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Identificar joya</h1><p>Toma la foto de una pieza (o súbela desde galería) y la IA te dice tipo de producto, tejido/estilo, patrón y confianza</p></div>
      </div>

      {!isAdmin && (
        <div className="readonly-banner">
          Tu rol es de <b>solo lectura</b>: puedes ver identificaciones ya hechas, pero subir una foto nueva solo lo puede hacer un administrador.
        </div>
      )}

      {error && <div className="login-error">{error}</div>}

      <div className="panel">
        <div className="panel-head"><h3>Elegir pieza</h3></div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
          Escribe el SKU de la pieza del inventario a la que corresponde la foto. Si la pieza ya tiene una
          identificación guardada, se muestra abajo.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Ej. 0000415187" value={skuBusqueda}
            onChange={(e) => setSkuBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscarSku()} style={{ width: 220 }} />
          <button className="btn" type="button" onClick={buscarSku} disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar'}</button>
        </div>
        {pieza === null && <div style={{ marginTop: 10, color: 'var(--text-dim)', fontSize: 12.5 }}>Esa SKU no existe en el inventario importado (igual puedes identificarla y guardarla).</div>}
        {pieza && (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table>
              <thead>
                <tr><th style={{ textAlign: 'left' }}>Descripción</th><th>Joyería</th><th>Gramos</th><th>Costo</th><th>Precio venta</th><th>Estado</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="name">{pieza.descripcion || '—'}</td>
                  <td>{pieza.joyeria}</td>
                  <td>{fmtGr(pieza.gramos)}</td>
                  <td>{fmtMoney(pieza.costoTotal)}</td>
                  <td>{fmtMoney(pieza.precioVenta)}</td>
                  <td>{pieza.estado}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Identificación por IA</h3></div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {foto?.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto.photo.src} alt={foto.photo.name} style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
          )}
          <div style={{ flex: 1, minWidth: 220 }}>
            {foto?.identificacion ? (
              <div style={{ fontSize: 13, lineHeight: 1.9 }}>
                <div><b>Tipo de producto:</b> {foto.identificacion.tipo_producto}</div>
                <div><b>Tejido / estilo:</b> {foto.identificacion.tejido_o_estilo}</div>
                <div><b>Patrón:</b> {foto.identificacion.patron}</div>
                <div><b>Confianza:</b> {foto.identificacion.confianza}</div>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                {skuBusqueda.trim() ? 'Esta SKU todavía no tiene foto ni identificación.' : 'Escribe arriba el SKU de la pieza antes de tomar o subir la foto.'}
              </div>
            )}
            {isAdmin && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn" type="button" disabled={identificando} onClick={() => camaraInputRef.current?.click()}>
                    📷 Tomar foto
                  </button>
                  <button className="btn-outline" type="button" disabled={identificando} onClick={() => galeriaInputRef.current?.click()}>
                    Subir desde galería
                  </button>
                </div>
                {/* capture="environment" abre directo la cámara trasera en celulares; en escritorio se ignora y actúa como un input de archivo normal. */}
                <input ref={camaraInputRef} type="file" accept="image/*" capture="environment" disabled={identificando}
                  onChange={(e) => handleIdentificarFoto(e.target.files?.[0])} style={{ display: 'none' }} />
                <input ref={galeriaInputRef} type="file" accept="image/*" disabled={identificando}
                  onChange={(e) => handleIdentificarFoto(e.target.files?.[0])} style={{ display: 'none' }} />
                {identificando && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>Subiendo e identificando…</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

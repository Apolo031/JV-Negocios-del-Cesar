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

  // Foto elegida (cámara o galería) + su identificación — todavía sin guardar en ninguna SKU.
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [identificacion, setIdentificacion] = useState(null);
  const [identificando, setIdentificando] = useState(false);
  const [error, setError] = useState('');

  // Guardar esa identificación en una pieza del inventario (opcional).
  const [skuGuardar, setSkuGuardar] = useState('');
  const [pieza, setPieza] = useState(undefined); // undefined = no buscada, null = no encontrada
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const camaraInputRef = useRef(null);
  const galeriaInputRef = useRef(null);

  async function handleElegirFoto(f) {
    if (!f) return;
    if (f.size > MAX_FOTO_BYTES) {
      setError('La foto pesa demasiado (máx. 8MB).');
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setIdentificacion(null);
    setGuardadoOk(false);
    setPieza(undefined);
    setError('');
    setIdentificando(true);
    try {
      const imageBase64 = await readFileAsBase64(f);
      const token = await getIdToken();
      const res = await fetch('/api/identify-joya', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64, mimeType: f.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo identificar la foto');
      setIdentificacion(data.identificacion);
    } catch (err) {
      setError(err.message);
    } finally {
      setIdentificando(false);
    }
  }

  async function buscarSku() {
    const sku = skuGuardar.trim();
    if (!sku) { setPieza(undefined); return; }
    setBuscando(true);
    setError('');
    try {
      const snap = await getDoc(doc(db, 'inventario', slugifyId(sku)));
      setPieza(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    } catch (err) {
      setError('No se pudo buscar el SKU: ' + err.message);
    } finally {
      setBuscando(false);
    }
  }

  async function handleGuardarEnSku() {
    const sku = skuGuardar.trim();
    if (!sku) { setError('Escribe el SKU de la pieza para guardar esta identificación.'); return; }
    if (!file || !identificacion) return;
    setGuardando(true);
    setError('');
    setGuardadoOk(false);
    try {
      const id = slugifyId(sku);
      const path = `inventario/${id}/${Date.now()}-${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const src = await getDownloadURL(fileRef);
      const photo = { src, name: file.name, path, type: file.type };
      await setDoc(doc(db, 'inventario_fotos', id), { photo, identificacion, identificadoEn: Date.now() });
      setGuardadoOk(true);
    } catch (err) {
      setError('No se pudo guardar: ' + err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Identificar joya</h1><p>Toma la foto de una pieza (o súbela desde galería) y la IA te dice tipo de producto, tejido/estilo, patrón y confianza</p></div>
      </div>

      {!isAdmin && (
        <div className="readonly-banner">
          Tu rol es de <b>solo lectura</b>: puedes ver identificaciones ya guardadas en Inventario, pero tomar o subir una foto nueva solo lo puede hacer un administrador.
        </div>
      )}

      {error && <div className="login-error">{error}</div>}

      {isAdmin && (
        <div className="panel">
          <div className="panel-head"><h3>Tomar o subir la foto</h3></div>
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
            onChange={(e) => handleElegirFoto(e.target.files?.[0])} style={{ display: 'none' }} />
          <input ref={galeriaInputRef} type="file" accept="image/*" disabled={identificando}
            onChange={(e) => handleElegirFoto(e.target.files?.[0])} style={{ display: 'none' }} />
        </div>
      )}

      {(previewUrl || identificando) && (
        <div className="panel">
          <div className="panel-head"><h3>Resultado</h3></div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Foto elegida" style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
            )}
            <div style={{ flex: 1, minWidth: 220 }}>
              {identificando ? (
                <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>Identificando con IA…</div>
              ) : identificacion ? (
                <div style={{ fontSize: 13, lineHeight: 1.9 }}>
                  <div><b>Tipo de producto:</b> {identificacion.tipo_producto}</div>
                  <div><b>Tejido / estilo:</b> {identificacion.tejido_o_estilo}</div>
                  <div><b>Patrón:</b> {identificacion.patron}</div>
                  <div><b>Confianza:</b> {identificacion.confianza}</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {identificacion && isAdmin && (
        <div className="panel">
          <div className="panel-head"><h3>Guardar en una pieza del inventario (opcional)</h3></div>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
            Si esta foto corresponde a una pieza del inventario importado, escribe su SKU para guardar la foto y
            la identificación ahí. Si no, puedes dejarlo así — ya viste el resultado arriba.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Ej. 0000415187" value={skuGuardar}
              onChange={(e) => { setSkuGuardar(e.target.value); setGuardadoOk(false); }}
              onKeyDown={(e) => e.key === 'Enter' && buscarSku()} style={{ width: 220 }} />
            <button className="btn-outline" type="button" onClick={buscarSku} disabled={buscando}>{buscando ? 'Buscando…' : 'Verificar SKU'}</button>
            <button className="btn" type="button" onClick={handleGuardarEnSku} disabled={guardando || !skuGuardar.trim()}>
              {guardando ? 'Guardando…' : 'Guardar en esta SKU'}
            </button>
          </div>
          {pieza === null && <div style={{ marginTop: 10, color: 'var(--text-dim)', fontSize: 12.5 }}>Esa SKU no existe en el inventario importado (igual puedes guardarla).</div>}
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
          {guardadoOk && <div style={{ marginTop: 12, color: 'var(--green)', fontSize: 12.5 }}>Guardado en la SKU {skuGuardar.trim()}.</div>}
        </div>
      )}
    </div>
  );
}

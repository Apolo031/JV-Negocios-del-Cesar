'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, doc, getDocs, onSnapshot, writeBatch, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { fmtMoney, fmtNum } from '@/lib/dataHelpers';
import { parseInmueblesBuffer, urlMapa } from '@/lib/inmueblesParser';

const WRITE_CHUNK = 450;

function fmtFecha(s) {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function Campo({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-dimmer)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>{titulo}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '2px 16px' }}>
        {children}
      </div>
    </div>
  );
}

function PropietarioCard({ p, index }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        {index + 1}. {p.nombre} {p.participacion ? <span style={{ color: 'var(--gold-light)', fontWeight: 700 }}>· {p.participacion}%</span> : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '2px 14px' }}>
        <Campo label="Documento" value={p.documento} />
        <Campo label="Dirección" value={p.direccion} />
        <Campo label="Municipio" value={p.municipio} />
        <Campo label="Teléfono residencia" value={p.telefonoRes} />
        <Campo label="Teléfono oficina" value={p.telefonoOf} />
        <Campo label="Celular" value={p.celular} />
        <Campo label="Email" value={p.email} />
        <Campo label="Email facturación" value={p.emailFacturacion} />
        <Campo label="Paga a (beneficiario)" value={p.beneficiario} />
        <Campo label="Banco" value={p.banco} />
        <Campo label="Tipo de cuenta" value={p.tipoCuenta} />
        <Campo label="Cuenta" value={p.cuenta} />
      </div>
    </div>
  );
}

const MAX_FOTOS = 2;
const MAX_FOTO_BYTES = 8 * 1024 * 1024;

async function subirFotoInmueble(contratoId, file) {
  const path = `inmuebles/${contratoId}/${Date.now()}-${file.name}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file, { contentType: file.type });
  const src = await getDownloadURL(fileRef);
  return { src, name: file.name, path };
}

/** Hasta 2 fotos por contrato, para identificar el inmueble de un vistazo. */
function FotosInmueble({ r, isAdmin }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const fotos = r.fotos || [];

  async function handleSubir(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Solo se aceptan imágenes.'); return; }
    if (file.size > MAX_FOTO_BYTES) { setError('La foto pesa más de 8 MB.'); return; }
    setSubiendo(true);
    setError('');
    try {
      const foto = await subirFotoInmueble(r.id, file);
      await updateDoc(doc(db, 'inmuebles', r.id), { fotos: [...fotos, foto] });
    } catch (err) {
      setError('No se pudo subir la foto: ' + err.message);
    } finally {
      setSubiendo(false);
    }
  }

  async function handleEliminarFoto(foto) {
    try {
      await deleteObject(ref(storage, foto.path));
    } catch (err) {
      // Si ya no existe en Storage, igual se quita de la lista del contrato.
    }
    await updateDoc(doc(db, 'inmuebles', r.id), { fotos: fotos.filter((f) => f.path !== foto.path) });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        Fotos del inmueble
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {fotos.map((f, i) => (
          <div key={f.path || i} style={{ position: 'relative' }}>
            <a href={f.src} target="_blank" rel="noopener noreferrer">
              <img
                src={f.src} alt={f.name || 'Foto del inmueble'}
                style={{ width: 140, height: 105, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', display: 'block' }}
              />
            </a>
            {isAdmin && (
              <button
                type="button" onClick={() => handleEliminarFoto(f)}
                title="Eliminar foto"
                style={{
                  position: 'absolute', top: 4, right: 4, padding: '1px 6px', fontSize: 11, lineHeight: '16px',
                  background: 'rgba(20,20,24,0.75)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 5, cursor: 'pointer',
                }}
              >✕</button>
            )}
          </div>
        ))}
        {isAdmin && fotos.length < MAX_FOTOS && (
          <label
            style={{
              width: 140, height: 105, border: '2px dashed var(--border)', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: subiendo ? 'default' : 'pointer',
              fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: 8,
            }}
          >
            {subiendo ? 'Subiendo…' : '+ Agregar foto'}
            <input type="file" accept="image/*" onChange={handleSubir} disabled={subiendo} style={{ display: 'none' }} />
          </label>
        )}
        {fotos.length === 0 && !isAdmin && <div className="empty-note">Sin fotos.</div>}
      </div>
      {error && <div className="login-error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

/** Compara contra lo que ya hay en Firestore y aplica el reemplazo completo (nuevos/actualizados + borra los que ya no están). */
async function importarRegistros(registros, setProgress) {
  if (registros.length === 0) {
    throw new Error('No se reconoció ningún contrato en el archivo (se esperaba la hoja "COLOMBIA").');
  }

  const existentesSnap = await getDocs(collection(db, 'inmuebles'));
  const idsExistentes = new Set(existentesSnap.docs.map((d) => d.id));
  const idsNuevos = new Set(registros.map((r) => r.id));
  const aEliminar = [...idsExistentes].filter((id) => !idsNuevos.has(id));

  const total = registros.length + aEliminar.length;
  let done = 0;

  for (let i = 0; i < registros.length; i += WRITE_CHUNK) {
    const slice = registros.slice(i, i + WRITE_CHUNK);
    const batch = writeBatch(db);
    for (const r of slice) batch.set(doc(db, 'inmuebles', r.id), { ...r, actualizadoEn: Date.now() });
    await batch.commit();
    done += slice.length;
    setProgress({ done, total });
  }
  for (let i = 0; i < aEliminar.length; i += WRITE_CHUNK) {
    const slice = aEliminar.slice(i, i + WRITE_CHUNK);
    const batch = writeBatch(db);
    for (const id of slice) batch.delete(doc(db, 'inmuebles', id));
    await batch.commit();
    done += slice.length;
    setProgress({ done, total });
  }

  return { count: registros.length, eliminados: aEliminar.length };
}

function ImportarInmuebles({ onImported }) {
  const { isAdmin, getIdToken } = useAuth();
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importingSheet, setImportingSheet] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  if (!isAdmin) return null;

  async function handleImport() {
    if (!file) { setError('Elige primero el archivo .xlsx'); return; }
    setImporting(true);
    setError('');
    setResult(null);
    setProgress(null);
    try {
      const buffer = await file.arrayBuffer();
      const registros = parseInmueblesBuffer(buffer);
      const res = await importarRegistros(registros, setProgress);
      setResult(res);
      setFile(null);
      onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  async function handleImportarDesdeSheet() {
    setImportingSheet(true);
    setError('');
    setResult(null);
    setProgress(null);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/sheet-inmuebles', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo descargar la hoja de Google.');
      }
      const buffer = await res.arrayBuffer();
      const registros = parseInmueblesBuffer(buffer);
      const result = await importarRegistros(registros, setProgress);
      setResult(result);
      onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setImportingSheet(false);
      setProgress(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Importar / actualizar contratos</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        Sube el Excel maestro de contratos (se lee solo la hoja <b>COLOMBIA</b>), o actualiza directo desde la
        hoja de Google en vivo. Cada contrato queda guardado con ocupación, sociedad, grupo, tipo de inmueble,
        metros², canon al 100 %, propietarios (con su % y su canon), seguro con valor asegurado y prima, e incremento. <b>Esta carga reemplaza</b>{' '}
        todo lo que ya está guardado — si un contrato ya no aparece, se elimina de aquí también — así que
        siempre viene del archivo/hoja completa y actualizada, no solo de los contratos nuevos.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0] || null)} style={{ fontSize: 12, color: 'var(--text-dim)' }} />
        <button className="btn" onClick={handleImport} disabled={importing || importingSheet || !file}>
          {importing ? (progress ? `Importando… (${progress.done}/${progress.total})` : 'Leyendo archivo…') : 'Importar archivo'}
        </button>
        <span style={{ color: 'var(--text-dimmer)', fontSize: 12 }}>o</span>
        <button className="btn-outline" onClick={handleImportarDesdeSheet} disabled={importing || importingSheet}>
          {importingSheet ? (progress ? `Importando… (${progress.done}/${progress.total})` : 'Descargando hoja…') : '🔄 Actualizar desde Google Sheets'}
        </button>
      </div>
      {error && <div className="login-error">{error}</div>}
      {result && (
        <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 12 }}>
          Listo: {result.count} contratos cargados{result.eliminados > 0 ? `, ${result.eliminados} eliminados (ya no estaban en el archivo)` : ''}.
        </div>
      )}
    </div>
  );
}

export default function BasePrincipalPage() {
  const { isAdmin } = useAuth();
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const [fBusqueda, setFBusqueda] = useState('');
  const [fMunicipio, setFMunicipio] = useState('__ALL__');
  const [fClase, setFClase] = useState('__ALL__');
  const [fEstado, setFEstado] = useState('__ALL__');
  const [sortBy, setSortBy] = useState(null); // null = orden por defecto (municipio); o 'contrato' / 'canon'
  const [sortDir, setSortDir] = useState('asc');

  function toggleSort(campo) {
    if (sortBy === campo) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(campo); setSortDir('asc'); }
  }

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inmuebles'), (snap) => {
      setRegistros(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const kpis = useMemo(() => {
    const activos = registros.filter((r) => r.activo);
    const municipios = new Set(registros.map((r) => r.municipioNormalizado).filter(Boolean));
    return {
      total: registros.length,
      activos: activos.length,
      inactivos: registros.length - activos.length,
      canonTotal: activos.reduce((s, r) => s + (r.canon || 0), 0),
      comisionTotal: activos.reduce((s, r) => s + (r.comisionMasIva || 0), 0),
      municipios: municipios.size,
    };
  }, [registros]);

  const municipiosOpciones = useMemo(() => {
    const map = new Map();
    registros.forEach((r) => {
      if (r.municipioNormalizado && !map.has(r.municipioNormalizado)) map.set(r.municipioNormalizado, r.municipio);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [registros]);

  const clasesOpciones = useMemo(
    () => [...new Set(registros.map((r) => r.clase).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [registros]
  );

  const filtrados = useMemo(() => {
    const busq = fBusqueda.trim().toLowerCase();
    return registros
      .filter((r) => {
        if (fMunicipio !== '__ALL__' && r.municipioNormalizado !== fMunicipio) return false;
        if (fClase !== '__ALL__' && r.clase !== fClase) return false;
        if (fEstado !== '__ALL__' && (fEstado === 'activo' ? !r.activo : r.activo)) return false;
        if (busq) {
          const nombresPropietarios = (r.propietarios || []).map((p) => p.nombre).join(' ');
          const hay = `${r.contrato} ${nombresPropietarios} ${r.inquilino} ${r.direccion}`.toLowerCase();
          if (!hay.includes(busq)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'contrato' || sortBy === 'canon') {
          const va = Number(a[sortBy]) || 0;
          const vb = Number(b[sortBy]) || 0;
          const diff = va - vb;
          return sortDir === 'asc' ? diff : -diff;
        }
        return (a.municipio || '').localeCompare(b.municipio || '', 'es') || (a.direccion || '').localeCompare(b.direccion || '', 'es');
      });
  }, [registros, fMunicipio, fClase, fEstado, fBusqueda, sortBy, sortDir]);

  function limpiarFiltros() {
    setFBusqueda(''); setFMunicipio('__ALL__'); setFClase('__ALL__'); setFEstado('__ALL__');
  }

  function handleExportExcel() {
    const rows = filtrados.map((r) => ({
      Ocupación: r.ocupacion || (r.activo ? 'ACTIVOS' : 'DISPONIBLE'),
      Contrato: r.contrato, Estado: r.activo ? 'Activo' : 'Inactivo',
      Sociedad: r.sociedad, Grupo: r.grupo, 'Tipo de inmueble': r.tipoInmueble, 'Metros²': r.metros2, Observaciones: r.observacionesZc || r.observaciones,
      Propietarios: (r.propietarios || []).map((p) => `${p.nombre} (${p.participacion}%)`).join(' / ') || null,
      Arrendatario: r.inquilino,
      Dirección: r.direccion, Municipio: r.municipio,
      'Canon 100%': r.canon,
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => {
        const p = (r.distribucionCanon || [])[n - 1];
        return [[`Propietario ${n}`, p?.nombre ?? null], [`% ${n}`, p ? p.porcentaje : null], [`Canon propietario ${n}`, p ? p.canon : null], [`Administrado por ${n}`, p?.administradoPor ?? null]];
      })),
      Aseguradora: r.seguro?.aseguradora || r.aseguradora, 'Valor asegurado': r.seguro?.valorAsegurado || null, 'Prima antes de IVA': r.seguro?.primaAntesIva || null,
      'Incremento': r.incremento, 'Día incremento': r.diaIncremento, 'Mes incremento': r.mesNombre,
      'Datos por revisar': (r.alertasDatos || []).join(' | ') || null,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Inmuebles');
    XLSX.writeFile(wb, `inmuebles_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleEliminar(id) {
    await deleteDoc(doc(db, 'inmuebles', id));
    if (expandedId === id) setExpandedId(null);
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Base principal</h1><p>Zona Centro inmobiliaria — contratos de arrendamiento, propietarios e inquilinos</p></div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><div className="label">Contratos totales</div><div className="value">{fmtNum(kpis.total)}</div></div>
        <div className="kpi"><div className="label">Activos / inactivos</div><div className="value">{fmtNum(kpis.activos)} / {fmtNum(kpis.inactivos)}</div></div>
        <div className="kpi"><div className="label">Canon mensual (activos)</div><div className="value">{fmtMoney(kpis.canonTotal)}</div></div>
        <div className="kpi"><div className="label">Municipios</div><div className="value">{fmtNum(kpis.municipios)}</div></div>
      </div>

      <ImportarInmuebles />

      <div className="panel">
        <div className="panel-head">
          <h3>Filtros</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-outline" type="button" onClick={limpiarFiltros}>Limpiar filtros</button>
            <button className="btn-outline" type="button" onClick={handleExportExcel} disabled={filtrados.length === 0}>⭳ Descargar Excel</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Municipio</div>
            <select value={fMunicipio} onChange={(e) => setFMunicipio(e.target.value)}>
              <option value="__ALL__">Todos</option>
              {municipiosOpciones.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Clase de inmueble</div>
            <select value={fClase} onChange={(e) => setFClase(e.target.value)}>
              <option value="__ALL__">Todas</option>
              {clasesOpciones.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Estado</div>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
              <option value="__ALL__">Todos</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Buscar contrato / propietario / arrendatario / dirección</div>
            <input type="text" value={fBusqueda} onChange={(e) => setFBusqueda(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Contratos</h3>
          <span className="hint">{filtrados.length} {filtrados.length === 1 ? 'registro' : 'registros'}</span>
        </div>
        {loading ? (
          <div className="empty-note">Cargando…</div>
        ) : registros.length === 0 ? (
          <div className="empty-note">Aún no hay contratos cargados{isAdmin ? '. Importa el Excel arriba para empezar.' : '.'}</div>
        ) : filtrados.length === 0 ? (
          <div className="empty-note">Ningún contrato coincide con los filtros.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('contrato')}>
                    Contrato {sortBy === 'contrato' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style={{ textAlign: 'left' }}>Propietario</th><th style={{ textAlign: 'left' }}>Arrendatario</th>
                  <th style={{ textAlign: 'left' }}>Dirección</th><th>Municipio</th><th>Clase</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('canon')}>
                    Canon {sortBy === 'canon' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => {
                  const mapa = urlMapa(r.direccion, r.municipio);
                  const abierto = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td>
                          {r.contrato ?? '—'}
                          {(r.alertasDatos?.length || 0) > 0 && (
                            <span title={r.alertasDatos.join('\n')} style={{ marginLeft: 6, color: 'var(--gold-light)', cursor: 'help' }}>⚠</span>
                          )}
                        </td>
                        <td className="name">
                          {r.propietario || '—'}
                          {(r.propietarios?.length || 0) > 1 && <span className="pill neu" style={{ marginLeft: 6 }}>+{r.propietarios.length - 1}</span>}
                        </td>
                        <td>{r.inquilino || '—'}</td>
                        <td>{r.direccion || '—'}</td>
                        <td>{r.municipio || '—'}</td>
                        <td>{r.clase || '—'}</td>
                        <td>{fmtMoney(r.canon)}</td>
                        <td><span className={`pill ${r.activo ? 'pos' : 'neu'}`}>{r.activo ? 'Activo' : 'Inactivo'}</span></td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button className="btn-outline" onClick={() => setExpandedId(abierto ? null : r.id)}>{abierto ? 'Ocultar' : 'Ver detalle'}</button>
                        </td>
                      </tr>
                      {abierto && (
                        <tr>
                          <td colSpan={9} style={{ background: 'var(--surface-2)', padding: '18px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10, gap: 8 }}>
                              {mapa && <a className="btn-outline" href={mapa} target="_blank" rel="noopener noreferrer">📍 Ver en mapa</a>}
                              {isAdmin && <button className="btn-outline" onClick={() => handleEliminar(r.id)}>Eliminar contrato</button>}
                            </div>

                            <FotosInmueble r={r} isAdmin={isAdmin} />

                            <Seccion titulo="Inmueble">
                              <Campo label="Dirección" value={r.direccion} />
                              <Campo label="Municipio" value={r.municipio} />
                              <Campo label="Tipo de inmueble" value={r.tipoInmueble} />
                              <Campo label="Metros²" value={r.metros2} />
                              <Campo label="Ocupación" value={r.ocupacion} />
                              <Campo label="Uso / observaciones" value={r.observacionesZc} />
                            </Seccion>

                            <Seccion titulo="Contrato">
                              <Campo label="Canon 100%" value={fmtMoney(r.canon)} />
                              <Campo label="Sociedad" value={r.sociedad} />
                              <Campo label="Grupo" value={r.grupo} />
                              <Campo label="Incremento" value={r.incremento ? (/^\d+([.,]\d+)?$/.test(r.incremento) ? `${r.incremento}%` : r.incremento) : null} />
                              <Campo label="Día de incremento" value={r.diaIncremento} />
                              <Campo label="Mes de incremento" value={r.mesNombre || r.mesIncremento} />
                            </Seccion>

                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                {(r.propietarios?.length || 0) > 1 ? `Propietarios (${r.propietarios.length} dueños)` : 'Propietario'}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {(r.propietarios || []).map((p, i) => <PropietarioCard key={i} p={p} index={i} />)}
                                {(r.propietarios || []).length === 0 && <div className="empty-note">Sin propietario registrado.</div>}
                              </div>
                            </div>

                            {(r.distribucionCanon?.length || 0) > 0 && (
                              <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                  Distribución del canon por propietario
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                  <table>
                                    <thead>
                                      <tr><th style={{ textAlign: 'left' }}>Propietario</th><th>%</th><th>Canon</th><th style={{ textAlign: 'left' }}>Administrado por</th></tr>
                                    </thead>
                                    <tbody>
                                      {r.distribucionCanon.map((p, i) => (
                                        <tr key={i}>
                                          <td className="name">{p.nombre}</td>
                                          <td>{p.porcentaje}%</td>
                                          <td>{fmtMoney(p.canon)}</td>
                                          <td style={{ textAlign: 'left' }}>{p.administradoPor || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            <Seccion titulo="Arrendatario">
                              <Campo label="Nombre" value={r.inquilino} />
                            </Seccion>

                            

                            <Seccion titulo="Seguro">
                              <Campo label="Aseguradora" value={r.seguro?.aseguradora || r.aseguradora} />
                              <Campo label="Valor asegurado" value={r.seguro?.valorAsegurado ? fmtMoney(r.seguro.valorAsegurado) : null} />
                              <Campo label="Prima antes de IVA" value={r.seguro?.primaAntesIva ? fmtMoney(r.seguro.primaAntesIva) : null} />
                            </Seccion>

                            {(r.alertasDatos?.length || 0) > 0 && (
                              <Seccion titulo="Datos por revisar en la hoja">
                                <div style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--gold-light)' }}>
                                  {r.alertasDatos.map((a, i) => <div key={i}>⚠ {a}</div>)}
                                </div>
                              </Seccion>
                            )}

                            {r.observaciones && (
                              <Seccion titulo="Observaciones">
                                <div style={{ gridColumn: '1 / -1', fontSize: 13 }}>{r.observaciones}</div>
                              </Seccion>
                            )}

                            <details>
                              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)' }}>Ver todos los datos originales del Excel</summary>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '2px 16px', marginTop: 10, maxHeight: 320, overflowY: 'auto' }}>
                                {Object.entries(r.raw || {}).filter(([, v]) => v !== null && v !== '').map(([k, v]) => (
                                  <Campo key={k} label={k} value={String(v)} />
                                ))}
                              </div>
                            </details>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

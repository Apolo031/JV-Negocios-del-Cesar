'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, doc, getDocs, onSnapshot, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
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

function ImportarInmuebles({ onImported }) {
  const { isAdmin } = useAuth();
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
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
      if (registros.length === 0) {
        throw new Error('No se reconoció ningún contrato en el archivo (se esperaba la hoja "BS-ACTIVOS...").');
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

      setResult({ count: registros.length, eliminados: aEliminar.length });
      setFile(null);
      onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Importar / actualizar contratos</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        Sube el Excel maestro de contratos (la hoja <b>BS-ACTIVOS</b>, el export completo del software de
        arriendos). Cada contrato queda guardado con propietario, arrendatario, coarrendatarios, seguro y
        condiciones del contrato. <b>Esta carga reemplaza</b> todo lo que ya está guardado — si un contrato
        ya no aparece en el nuevo archivo, se elimina de aquí también — así que siempre sube el archivo
        completo y actualizado, no solo los contratos nuevos.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0] || null)} style={{ fontSize: 12, color: 'var(--text-dim)' }} />
        <button className="btn" onClick={handleImport} disabled={importing || !file}>
          {importing ? (progress ? `Importando… (${progress.done}/${progress.total})` : 'Leyendo archivo…') : 'Importar archivo'}
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
          const hay = `${r.contrato} ${r.propietario} ${r.inquilino} ${r.direccion}`.toLowerCase();
          if (!hay.includes(busq)) return false;
        }
        return true;
      })
      .sort((a, b) => (a.municipio || '').localeCompare(b.municipio || '', 'es') || (a.direccion || '').localeCompare(b.direccion || '', 'es'));
  }, [registros, fMunicipio, fClase, fEstado, fBusqueda]);

  function limpiarFiltros() {
    setFBusqueda(''); setFMunicipio('__ALL__'); setFClase('__ALL__'); setFEstado('__ALL__');
  }

  function handleExportExcel() {
    const rows = filtrados.map((r) => ({
      Contrato: r.contrato, Estado: r.activo ? 'Activo' : 'Inactivo',
      Propietario: r.propietario, 'Participación propietario': r.propietarioDoc?.participacion,
      Copropietarios: (r.copropietarios || []).map((c) => `${c.nombre} (${c.participacion}%)`).join(' / ') || null,
      Arrendatario: r.inquilino,
      Dirección: r.direccion, Municipio: r.municipio, Barrio: r.barrio, Clase: r.clase, 'Tipo de contrato': r.tipoContrato,
      Canon: r.canon, 'Comisión + IVA': r.comisionMasIva, Aseguradora: r.aseguradora,
      'Celular arrendatario': r.inquilinoDoc?.celular, 'Celular propietario': r.propietarioDoc?.celular,
      'Fecha contrato': r.fechaContrato, 'Fecha fin contrato': r.fechaFinContrato, Asesor: r.asesor,
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
                  <th>Contrato</th><th style={{ textAlign: 'left' }}>Propietario</th><th style={{ textAlign: 'left' }}>Arrendatario</th>
                  <th style={{ textAlign: 'left' }}>Dirección</th><th>Municipio</th><th>Clase</th><th>Canon</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => {
                  const mapa = urlMapa(r.direccion, r.municipio);
                  const abierto = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td>{r.contrato}</td>
                        <td className="name">{r.propietario || '—'}</td>
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

                            <Seccion titulo="Inmueble">
                              <Campo label="Dirección" value={r.direccion} />
                              <Campo label="Municipio" value={r.municipio} />
                              <Campo label="Barrio" value={r.barrio} />
                              <Campo label="Urbanización" value={r.urbanizacion} />
                              <Campo label="Estrato" value={r.estrato} />
                              <Campo label="Zona" value={r.zona} />
                              <Campo label="Clase" value={r.clase} />
                              <Campo label="Destinación comercial" value={r.destinacionComercial} />
                              <Campo label="Teléfono inmueble" value={r.telInmueble} />
                            </Seccion>

                            <Seccion titulo="Contrato">
                              <Campo label="Tipo de contrato" value={r.tipoContrato} />
                              <Campo label="Duración" value={r.duracionContrato} />
                              <Campo label="Fecha contrato" value={fmtFecha(r.fechaContrato)} />
                              <Campo label="Fecha fin contrato" value={fmtFecha(r.fechaFinContrato)} />
                              <Campo label="Fecha incremento" value={fmtFecha(r.fechaIncremento)} />
                              <Campo label="Canon" value={fmtMoney(r.canon)} />
                              <Campo label="Valor administración" value={fmtMoney(r.valorAdministracion)} />
                              <Campo label="% comisión" value={r.porcentajeComision ? `${r.porcentajeComision}%` : null} />
                              <Campo label="Comisión + IVA" value={fmtMoney(r.comisionMasIva)} />
                              <Campo label="Grupo" value={r.grupo} />
                              <Campo label="Asesor" value={r.asesor} />
                              <Campo label="Auxiliar" value={r.auxiliar} />
                            </Seccion>

                            <Seccion titulo={`Propietario${r.copropietarios?.length > 0 ? ` (${1 + r.copropietarios.length} dueños)` : ''}`}>
                              <Campo label="Nombre" value={r.propietario} />
                              <Campo label="Participación" value={r.propietarioDoc?.participacion ? `${r.propietarioDoc.participacion}%` : null} />
                              <Campo label="Documento" value={r.propietarioDoc?.nroId} />
                              <Campo label="Dirección" value={r.propietarioDoc?.direccion} />
                              <Campo label="Municipio" value={r.propietarioDoc?.municipio} />
                              <Campo label="Teléfono residencia" value={r.propietarioDoc?.telefonoRes} />
                              <Campo label="Teléfono oficina" value={r.propietarioDoc?.telefonoOf} />
                              <Campo label="Celular" value={r.propietarioDoc?.celular} />
                              <Campo label="Email" value={r.propietarioDoc?.email} />
                              <Campo label="Email facturación" value={r.propietarioDoc?.emailFacturacion} />
                              <Campo label="Banco" value={r.propietarioDoc?.banco} />
                              <Campo label="Tipo de cuenta" value={r.propietarioDoc?.tipoCuenta} />
                              <Campo label="Cuenta" value={r.propietarioDoc?.cuenta} />
                            </Seccion>

                            <Seccion titulo="Arrendatario">
                              <Campo label="Nombre" value={r.inquilino} />
                              <Campo label="Documento" value={r.inquilinoDoc?.nroId} />
                              <Campo label="Celular" value={r.inquilinoDoc?.celular} />
                              <Campo label="Teléfono oficina" value={r.inquilinoDoc?.telOf} />
                              <Campo label="Otros teléfonos" value={r.inquilinoDoc?.telOtros} />
                              <Campo label="Email" value={r.inquilinoDoc?.email} />
                              <Campo label="Email facturación" value={r.inquilinoDoc?.emailFacturacion} />
                              <Campo label="Dirección correspondencia" value={r.inquilinoDoc?.direccionCorrespondencia} />
                              <Campo label="Municipio correspondencia" value={r.inquilinoDoc?.municipioCorrespondencia} />
                            </Seccion>

                            {r.copropietarios?.length > 0 && (
                              <Seccion titulo={`Copropietarios (${r.copropietarios.length})`}>
                                {r.copropietarios.map((c, i) => (
                                  <Campo
                                    key={i}
                                    label={`Copropietario ${i + 1} · ${c.participacion}%`}
                                    value={`${c.nombre}${c.beneficiario?.nombre && c.beneficiario.nombre !== c.nombre ? ` (paga a: ${c.beneficiario.nombre})` : ''}`}
                                  />
                                ))}
                              </Seccion>
                            )}

                            {r.coarrendatarios?.length > 0 && (
                              <Seccion titulo={`Coarrendatarios (${r.coarrendatarios.length})`}>
                                {r.coarrendatarios.map((c, i) => (
                                  <Campo key={i} label={`Coarrendatario ${i + 1}`} value={`${c.nombre}${c.celular ? ` · ${c.celular}` : ''}`} />
                                ))}
                              </Seccion>
                            )}

                            <Seccion titulo="Seguro">
                              <Campo label="Aseguradora" value={r.aseguradora} />
                              <Campo label="Siniestrado" value={r.siniestrado ? 'Sí' : 'No'} />
                            </Seccion>

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

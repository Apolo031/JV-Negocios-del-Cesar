'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { MONTH_NAMES_FULL, fmtMoney, fmtNum, fmtPct } from '@/lib/dataHelpers';
import { parseNombreFactura, SERVICIOS } from '@/lib/facturasServiciosParser';
import { normalizarMunicipio } from '@/lib/municipios';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const TIPOS_DOC_ACEPTADOS = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
// Solo PDF e imagen se le pueden pasar a la IA para extraer datos — un .docx hay que abrirlo a mano.
const TIPOS_EXTRAIBLES = ['application/pdf'];

function esArchivoAceptado(file) {
  return file.type.startsWith('image/') || TIPOS_DOC_ACEPTADOS.includes(file.type);
}

function esExtraible(archivo) {
  return archivo?.type && (TIPOS_EXTRAIBLES.includes(archivo.type) || archivo.type.startsWith('image/'));
}

/**
 * Le pide al servidor que lea la factura con IA y guarda lo que encuentre en
 * el documento. La descarga del archivo la hace el servidor (no el
 * navegador): el bucket de Storage no trae encabezados CORS, así que un
 * fetch directo desde el cliente a esa URL queda bloqueado.
 */
async function extraerDatosFactura(f, getIdToken) {
  const token = await getIdToken();
  const res = await fetch('/api/extraer-factura', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: f.archivo.src }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo extraer la información');
  const e = data.extraido;
  // Una factura de un solo servicio trae un único elemento en "servicios";
  // una combinada (ej. EPM) trae uno por cada servicio con su propio valor.
  const desglose = Array.isArray(e.servicios)
    ? e.servicios.map((s) => ({
        servicio: s.servicio || 'Otro',
        consumo: typeof s.consumo === 'number' ? s.consumo : null,
        unidadConsumo: s.unidad_consumo || null,
        valor: typeof s.valor === 'number' ? s.valor : null,
      }))
    : [];
  await updateDoc(doc(db, 'facturas_servicios', f.id), {
    empresa: e.empresa || null,
    valorTotal: typeof e.valor_total === 'number' ? e.valor_total : null,
    desglose,
    periodoFacturado: e.periodo_facturado || null,
    fechaVencimiento: e.fecha_vencimiento || null,
    numeroFactura: e.numero_factura || null,
    confianzaExtraccion: e.confianza || null,
    extraido: true,
    errorExtraccion: null,
  });
}

let idCounter = 0;
function nextId() { idCounter += 1; return `f_${Date.now()}_${idCounter}`; }

function periodoLabel(periodo) {
  if (!periodo) return '—';
  const [y, m] = periodo.split('-');
  return `${MONTH_NAMES_FULL[parseInt(m, 10) - 1]} ${y}`;
}

const AÑOS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i);

function SubirFacturas({ inmueblesPorContrato, onGuardado, municipioLabel }) {
  const { isAdmin } = useAuth();
  const hoy = new Date();
  const [periodoAnio, setPeriodoAnio] = useState(hoy.getFullYear());
  const [periodoMes, setPeriodoMes] = useState(hoy.getMonth() + 1);
  const [items, setItems] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [progress, setProgress] = useState(null);
  const [mensaje, setMensaje] = useState('');

  if (!isAdmin) return null;

  function agregarArchivos(fileList) {
    const nuevos = Array.from(fileList || [])
      .filter(esArchivoAceptado)
      .map((f) => {
        const { contrato, servicio, subunidad } = parseNombreFactura(f.name);
        // En el espacio de un municipio, todo lo que se sube es de ese
        // municipio — no hace falta adivinarlo de la carpeta. En la vista
        // general (sin municipio fijo) sí se usa el nombre de la carpeta.
        const partes = (f.webkitRelativePath || '').split('/');
        const municipio = municipioLabel || (partes.length >= 2 ? partes[partes.length - 2] : '');
        return {
          id: nextId(), file: f, nombre: f.name,
          contrato: contrato || '', servicio, subunidad: subunidad || '', municipio,
        };
      });
    if (nuevos.length) setItems((prev) => [...prev, ...nuevos]);
    setMensaje('');
  }

  function actualizarItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function quitarItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }
  function limpiarTodo() {
    setItems([]);
    setMensaje('');
  }

  async function handleGuardarTodo() {
    const aGuardar = items.filter((it) => it.contrato.trim());
    const sinContrato = items.length - aGuardar.length;
    if (aGuardar.length === 0) {
      setMensaje('Error: ningún archivo tiene un número de contrato asignado.');
      return;
    }

    setGuardando(true);
    setMensaje('');
    const periodo = `${periodoAnio}-${String(periodoMes).padStart(2, '0')}`;
    let done = 0;
    try {
      for (const it of aGuardar) {
        if (it.file.size > MAX_FILE_BYTES) throw new Error(`"${it.nombre}" pesa más de 8 MB.`);
        const contrato = it.contrato.trim();
        const path = `facturas_servicios/${contrato}/${periodo}/${Date.now()}-${it.file.name}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, it.file, { contentType: it.file.type });
        const src = await getDownloadURL(fileRef);
        await addDoc(collection(db, 'facturas_servicios'), {
          contrato, servicio: it.servicio, subunidad: it.subunidad.trim() || null,
          municipio: it.municipio || inmueblesPorContrato.get(contrato)?.municipio || null,
          periodo,
          archivo: { src, name: it.file.name, path, type: it.file.type },
          actualizadoEn: Date.now(),
        });
        done += 1;
        setProgress({ done, total: aGuardar.length });
      }
      setMensaje(`Listo: ${aGuardar.length} factura${aGuardar.length === 1 ? '' : 's'} guardada${aGuardar.length === 1 ? '' : 's'} para ${periodoLabel(periodo)}${sinContrato > 0 ? ` — ${sinContrato} sin contrato no se guardaron` : ''}.`);
      setItems((prev) => prev.filter((it) => !it.contrato.trim()));
      onGuardado?.();
    } catch (err) {
      setMensaje('Error: ' + err.message);
    } finally {
      setGuardando(false);
      setProgress(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Subir facturas{municipioLabel ? ` — ${municipioLabel}` : ''}</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        Sube varios archivos a la vez (o una carpeta completa) — el nombre de cada uno se usa para adivinar el
        contrato y el servicio (ej. "CONTRATO 194 EPM.pdf").{municipioLabel ? ` Todo lo que subas aquí queda marcado como de ${municipioLabel}.` : ''}{' '}
        <b>Revisa y corrige antes de guardar</b>: algunos nombres no traen el contrato claro y hay que asignarlo a mano.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Mes de la factura</div>
          <select value={periodoMes} onChange={(e) => setPeriodoMes(parseInt(e.target.value, 10))}>
            {MONTH_NAMES_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Año</div>
          <select value={periodoAnio} onChange={(e) => setPeriodoAnio(parseInt(e.target.value, 10))}>
            {AÑOS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <label className="btn-outline" style={{ cursor: 'pointer' }}>
          Elegir archivos
          <input type="file" multiple accept="application/pdf,image/*,.docx" onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
        </label>
        <label className="btn-outline" style={{ cursor: 'pointer' }}>
          Elegir carpeta completa
          <input type="file" multiple webkitdirectory="" directory="" onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
        </label>
        {items.length > 0 && <button className="btn-outline" type="button" onClick={limpiarTodo}>Quitar todos</button>}
      </div>

      {items.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Archivo</th>
                  <th>Municipio</th>
                  <th>Contrato</th>
                  <th style={{ textAlign: 'left' }}>¿A quién pertenece?</th>
                  <th>Servicio</th>
                  <th>Subunidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const match = it.contrato.trim() ? inmueblesPorContrato.get(it.contrato.trim()) : null;
                  return (
                    <tr key={it.id}>
                      <td className="name" style={{ fontSize: 12 }}>{it.nombre}</td>
                      <td style={{ fontSize: 12 }}>{it.municipio || '—'}</td>
                      <td>
                        <input
                          type="text" value={it.contrato} placeholder="?"
                          onChange={(e) => actualizarItem(it.id, { contrato: e.target.value.replace(/[^\d]/g, '') })}
                          style={{ width: 64, textAlign: 'center', borderColor: it.contrato && !match ? 'var(--red)' : undefined }}
                        />
                      </td>
                      <td style={{ fontSize: 11.5, color: match ? 'var(--text-dim)' : 'var(--red)' }}>
                        {!it.contrato.trim() ? 'Falta asignar contrato' : match ? `${match.propietario || '—'} · ${match.direccion || ''}` : 'No existe ese contrato en Base principal'}
                      </td>
                      <td>
                        <select value={it.servicio} onChange={(e) => actualizarItem(it.id, { servicio: e.target.value })}>
                          {SERVICIOS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text" value={it.subunidad} placeholder="—"
                          onChange={(e) => actualizarItem(it.id, { subunidad: e.target.value })}
                          style={{ width: 100 }}
                        />
                      </td>
                      <td><button className="btn-outline" type="button" onClick={() => quitarItem(it.id)}>Quitar</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="btn" type="button" onClick={handleGuardarTodo} disabled={guardando}>
            {guardando ? (progress ? `Guardando… (${progress.done}/${progress.total})` : 'Guardando…') : `Guardar ${items.filter((it) => it.contrato.trim()).length} factura(s) de ${periodoLabel(`${periodoAnio}-${String(periodoMes).padStart(2, '0')}`)}`}
          </button>
        </>
      )}
      {mensaje && <div className={mensaje.startsWith('Error') ? 'login-error' : ''} style={{ marginTop: 12, fontSize: 12.5, color: mensaje.startsWith('Error') ? undefined : 'var(--green)' }}>{mensaje}</div>}
    </div>
  );
}

/**
 * Vista completa de facturas de servicios públicos. Sin `municipioFiltro`
 * muestra TODOS los municipios juntos (con su propio selector); con
 * `municipioFiltro` (clave normalizada) queda fijo en ese municipio — es el
 * "espacio" dedicado de cada uno, para no tener que elegirlo cada vez que
 * subes archivos.
 */
export default function FacturaServiciosView({ municipioFiltro = null, municipioLabel = null }) {
  const { isAdmin, getIdToken } = useAuth();
  const [facturas, setFacturas] = useState([]);
  const [inmuebles, setInmuebles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extrayendoId, setExtrayendoId] = useState(null);
  const [extrayendoTodo, setExtrayendoTodo] = useState(false);
  const [progresoExtraccion, setProgresoExtraccion] = useState(null);
  const [borrandoTodo, setBorrandoTodo] = useState(false);
  const [progresoBorrado, setProgresoBorrado] = useState(null);

  const [fPeriodo, setFPeriodo] = useState('__ALL__');
  const [fMunicipio, setFMunicipio] = useState('__ALL__'); // solo se usa cuando NO hay municipioFiltro (vista general)
  const [fServicio, setFServicio] = useState('__ALL__');
  const [fBusqueda, setFBusqueda] = useState('');

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, 'facturas_servicios'), (snap) => {
      setFacturas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const unsub2 = onSnapshot(collection(db, 'inmuebles'), (snap) => {
      setInmuebles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const inmueblesPorContrato = useMemo(() => {
    const map = new Map();
    inmuebles.forEach((r) => {
      if (r.contrato !== null && r.contrato !== undefined) {
        map.set(String(r.contrato), { propietario: r.propietario, direccion: r.direccion, municipio: r.municipio });
      }
    });
    return map;
  }, [inmuebles]);

  // Las facturas de ESTE espacio: si hay municipioFiltro, ya quedan
  // reducidas a ese municipio (comparando sin tildes/mayúsculas, porque el
  // mismo municipio puede venir escrito distinto según de dónde haya
  // salido); si no, son todas.
  const facturasDelEspacio = useMemo(() => {
    if (!municipioFiltro) return facturas;
    return facturas.filter((f) => normalizarMunicipio(f.municipio) === municipioFiltro);
  }, [facturas, municipioFiltro]);

  const periodos = useMemo(() => [...new Set(facturasDelEspacio.map((f) => f.periodo))].sort().reverse(), [facturasDelEspacio]);
  const municipiosOpciones = useMemo(() => {
    const map = new Map();
    facturasDelEspacio.forEach((f) => {
      const key = normalizarMunicipio(f.municipio);
      if (key && !map.has(key)) map.set(key, f.municipio);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [facturasDelEspacio]);

  // Igual que "filtradas" pero SIN el filtro de periodo — es la base del
  // consolidado mes a mes, que por definición necesita ver todos los meses
  // a la vez (respeta municipio/servicio/búsqueda para poder comparar solo
  // uno si así lo filtras).
  const filtradasSinPeriodo = useMemo(() => {
    const busq = fBusqueda.trim().toLowerCase();
    return facturasDelEspacio.filter((f) => {
      if (!municipioFiltro && fMunicipio !== '__ALL__' && normalizarMunicipio(f.municipio) !== fMunicipio) return false;
      if (fServicio !== '__ALL__' && f.servicio !== fServicio) return false;
      if (busq) {
        const info = inmueblesPorContrato.get(f.contrato);
        const hay = `${f.contrato} ${info?.propietario || ''} ${info?.direccion || ''} ${f.municipio || ''}`.toLowerCase();
        if (!hay.includes(busq)) return false;
      }
      return true;
    });
  }, [facturasDelEspacio, municipioFiltro, fMunicipio, fServicio, fBusqueda, inmueblesPorContrato]);

  const filtradas = useMemo(() => {
    return filtradasSinPeriodo
      .filter((f) => fPeriodo === '__ALL__' || f.periodo === fPeriodo)
      .sort((a, b) => b.periodo.localeCompare(a.periodo) || (a.municipio || '').localeCompare(b.municipio || '', 'es') || Number(a.contrato) - Number(b.contrato));
  }, [filtradasSinPeriodo, fPeriodo]);

  const resumenGasto = useMemo(() => {
    const total = filtradas.reduce((s, f) => s + (f.valorTotal || 0), 0);
    const conDatos = filtradas.filter((f) => f.extraido).length;
    const porServicio = {};
    // Si la factura trae desglose (ej. EPM: energía + acueducto + alcantarillado
    // en un solo archivo), cada servicio aporta su propio valor; si no, se usa
    // el total completo bajo el único servicio del archivo.
    filtradas.forEach((f) => {
      if (f.desglose?.length) {
        f.desglose.forEach((d) => {
          if (!d.valor) return;
          porServicio[d.servicio] = (porServicio[d.servicio] || 0) + d.valor;
        });
      } else if (f.valorTotal) {
        porServicio[f.servicio] = (porServicio[f.servicio] || 0) + f.valorTotal;
      }
    });
    const filas = Object.entries(porServicio).sort((a, b) => b[1] - a[1]);
    return { total, conDatos, filas };
  }, [filtradas]);

  // Consolidado mes a mes: total de gasto por periodo, en orden cronológico,
  // comparado contra el mes inmediatamente anterior — para detectar cuándo
  // subió el gasto de un mes a otro, sin importar el filtro de periodo.
  const consolidadoMensual = useMemo(() => {
    const porPeriodo = {};
    filtradasSinPeriodo.forEach((f) => {
      if (!f.valorTotal) return;
      porPeriodo[f.periodo] = (porPeriodo[f.periodo] || 0) + f.valorTotal;
    });
    const periodosOrdenados = Object.keys(porPeriodo).sort();
    return periodosOrdenados.map((p, i) => {
      const valor = porPeriodo[p];
      const anterior = i > 0 ? porPeriodo[periodosOrdenados[i - 1]] : null;
      const variacionPct = anterior ? ((valor - anterior) / anterior) * 100 : null;
      return { periodo: p, valor, anterior, variacionPct, subio: anterior !== null && valor > anterior };
    });
  }, [filtradasSinPeriodo]);

  const ultimaSubida = consolidadoMensual.length > 0 ? consolidadoMensual[consolidadoMensual.length - 1] : null;

  const promedioMensual = useMemo(
    () => (consolidadoMensual.length > 0 ? consolidadoMensual.reduce((s, m) => s + m.valor, 0) / consolidadoMensual.length : 0),
    [consolidadoMensual]
  );
  const proyeccionAnual = promedioMensual * 12;
  const mesMayorGasto = useMemo(
    () => (consolidadoMensual.length > 0 ? consolidadoMensual.reduce((max, m) => (m.valor > max.valor ? m : max), consolidadoMensual[0]) : null),
    [consolidadoMensual]
  );

  // Igual que "consolidadoMensual" pero desglosado por servicio — para ver
  // mes a mes cuál servicio sube o baja, no solo el total. Respeta el mismo
  // desglose EPM (energía/acueducto/alcantarillado) que "Gasto por servicio".
  const consolidadoPorServicio = useMemo(() => {
    const porPeriodoServicio = {};
    filtradasSinPeriodo.forEach((f) => {
      if (!porPeriodoServicio[f.periodo]) porPeriodoServicio[f.periodo] = {};
      const bucket = porPeriodoServicio[f.periodo];
      if (f.desglose?.length) {
        f.desglose.forEach((d) => {
          if (!d.valor) return;
          bucket[d.servicio] = (bucket[d.servicio] || 0) + d.valor;
        });
      } else if (f.valorTotal) {
        bucket[f.servicio] = (bucket[f.servicio] || 0) + f.valorTotal;
      }
    });
    const periodosOrdenados = Object.keys(porPeriodoServicio).sort();
    const servicios = [...new Set(Object.values(porPeriodoServicio).flatMap((b) => Object.keys(b)))].sort((a, b) => a.localeCompare(b, 'es'));
    const filas = servicios.map((servicio) => {
      const valores = periodosOrdenados.map((p) => porPeriodoServicio[p][servicio] || 0);
      const ultimo = valores[valores.length - 1] || 0;
      const anterior = valores.length > 1 ? valores[valores.length - 2] : null;
      const variacionPct = anterior ? ((ultimo - anterior) / anterior) * 100 : null;
      return { servicio, valores, ultimo, anterior, variacionPct, subio: anterior !== null && ultimo > anterior };
    });
    return { periodos: periodosOrdenados, filas };
  }, [filtradasSinPeriodo]);

  const servicioMayorIncremento = useMemo(() => {
    const conVariacion = consolidadoPorServicio.filas.filter((f) => f.variacionPct !== null && f.subio);
    if (conVariacion.length === 0) return null;
    return conVariacion.reduce((max, f) => (f.variacionPct > max.variacionPct ? f : max), conVariacion[0]);
  }, [consolidadoPorServicio]);

  // Ranking de contratos por gasto acumulado — para ver de un vistazo cuáles
  // inmuebles pesan más en la cuenta y cuáles subieron de un mes a otro.
  const topContratos = useMemo(() => {
    const porContrato = {};
    filtradasSinPeriodo.forEach((f) => {
      if (!f.contrato) return;
      if (!porContrato[f.contrato]) porContrato[f.contrato] = { total: 0, facturas: 0, porPeriodo: {} };
      const entry = porContrato[f.contrato];
      const valor = f.valorTotal || 0;
      entry.total += valor;
      entry.facturas += 1;
      entry.porPeriodo[f.periodo] = (entry.porPeriodo[f.periodo] || 0) + valor;
    });
    const periodosOrdenados = [...new Set(filtradasSinPeriodo.map((f) => f.periodo))].sort();
    const ultimoPeriodo = periodosOrdenados[periodosOrdenados.length - 1];
    const anteriorPeriodo = periodosOrdenados[periodosOrdenados.length - 2];
    return Object.entries(porContrato)
      .map(([contrato, v]) => {
        const ultimo = v.porPeriodo[ultimoPeriodo] || 0;
        const anterior = anteriorPeriodo ? v.porPeriodo[anteriorPeriodo] || 0 : null;
        const variacionPct = anterior ? ((ultimo - anterior) / anterior) * 100 : null;
        return { contrato, total: v.total, facturas: v.facturas, ultimo, anterior, variacionPct, subio: anterior !== null && ultimo > anterior };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filtradasSinPeriodo]);

  const pendientesExtraccion = useMemo(() => facturasDelEspacio.filter((f) => !f.extraido && esExtraible(f.archivo)), [facturasDelEspacio]);

  async function handleExtraerUna(f) {
    setExtrayendoId(f.id);
    try {
      await extraerDatosFactura(f, getIdToken);
    } catch (err) {
      await updateDoc(doc(db, 'facturas_servicios', f.id), { errorExtraccion: err.message });
    } finally {
      setExtrayendoId(null);
    }
  }

  async function handleExtraerPendientes() {
    setExtrayendoTodo(true);
    let done = 0;
    setProgresoExtraccion({ done, total: pendientesExtraccion.length });
    for (const f of pendientesExtraccion) {
      try {
        await extraerDatosFactura(f, getIdToken);
      } catch (err) {
        await updateDoc(doc(db, 'facturas_servicios', f.id), { errorExtraccion: err.message });
      }
      done += 1;
      setProgresoExtraccion({ done, total: pendientesExtraccion.length });
    }
    setExtrayendoTodo(false);
    setProgresoExtraccion(null);
  }

  async function handleEliminar(f) {
    try {
      await deleteObject(ref(storage, f.archivo.path));
    } catch (err) {
      // si ya no existe en Storage, igual se quita el registro
    }
    await deleteDoc(doc(db, 'facturas_servicios', f.id));
  }

  /** Borra TODAS las facturas de este espacio (el municipio actual, o todas si es la vista general) y sus archivos en Storage. No se puede deshacer. */
  async function handleEliminarTodas() {
    const total = facturasDelEspacio.length;
    if (total === 0) return;
    const ok = window.confirm(
      municipioLabel
        ? `¿Eliminar las ${total} facturas de ${municipioLabel}? Esto también borra los archivos subidos. No se puede deshacer.`
        : `¿Eliminar las ${total} facturas cargadas (todos los periodos y municipios)? Esto también borra los archivos subidos. No se puede deshacer.`
    );
    if (!ok) return;

    setBorrandoTodo(true);
    setProgresoBorrado({ done: 0, total });
    let done = 0;
    for (const f of facturasDelEspacio) {
      try {
        if (f.archivo?.path) await deleteObject(ref(storage, f.archivo.path));
      } catch (err) {
        // si ya no existe en Storage, igual se borra el registro
      }
      await deleteDoc(doc(db, 'facturas_servicios', f.id));
      done += 1;
      setProgresoBorrado({ done, total });
    }
    setBorrandoTodo(false);
    setProgresoBorrado(null);
  }

  function limpiarFiltros() {
    setFPeriodo('__ALL__'); setFMunicipio('__ALL__'); setFServicio('__ALL__'); setFBusqueda('');
  }

  /** Una fila por cada servicio real (una factura EPM aporta varias filas, una por cada servicio que traiga desglosado). */
  function handleExportExcel() {
    const rows = [];
    filtradas.forEach((f) => {
      const info = inmueblesPorContrato.get(f.contrato);
      const base = {
        Periodo: periodoLabel(f.periodo), Contrato: f.contrato,
        Propietario: info?.propietario || null, Dirección: info?.direccion || f.archivo?.name || null,
        Municipio: f.municipio || info?.municipio || null, Subunidad: f.subunidad || null,
        Empresa: f.empresa || null, 'Número factura': f.numeroFactura || null,
        'Periodo facturado': f.periodoFacturado || null, 'Fecha vencimiento': f.fechaVencimiento || null,
        'Valor total factura': f.valorTotal || null, 'Confianza extracción': f.confianzaExtraccion || null,
        Archivo: f.archivo?.name || null,
      };
      if (f.desglose?.length) {
        f.desglose.forEach((d) => {
          rows.push({ ...base, Servicio: d.servicio, Consumo: d.consumo, Unidad: d.unidadConsumo, 'Valor del servicio': d.valor });
        });
      } else {
        rows.push({ ...base, Servicio: f.servicio, Consumo: f.consumo ?? null, Unidad: f.unidadConsumo || null, 'Valor del servicio': f.valorTotal || null });
      }
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Facturas');
    const sufijo = municipioLabel ? `_${municipioLabel.toLowerCase().replace(/\s+/g, '-')}` : '';
    XLSX.writeFile(wb, `facturas_servicios${sufijo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <Link href="/factura-servicios-publicos" style={{ fontSize: 12, color: 'var(--text-dim)' }}>← Elegir otro municipio</Link>
          <h1 style={{ marginTop: 4 }}>Factura servicios públicos{municipioLabel ? ` — ${municipioLabel}` : ' — Todos los municipios'}</h1>
          <p>Zona Centro inmobiliaria — energía, acueducto, gas y demás servicios por contrato</p>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><div className="label">Facturas cargadas</div><div className="value">{facturasDelEspacio.length}</div></div>
        <div className="kpi"><div className="label">Gasto total (filtro actual)</div><div className="value">{fmtMoney(resumenGasto.total)}</div></div>
        <div className="kpi"><div className="label">Periodos</div><div className="value">{periodos.length}</div></div>
        {!municipioFiltro && <div className="kpi"><div className="label">Municipios</div><div className="value">{municipiosOpciones.length}</div></div>}
      </div>

      {consolidadoMensual.length > 0 && (
        <div className="kpi-row">
          <div className="kpi"><div className="label">Promedio mensual</div><div className="value">{fmtMoney(promedioMensual)}</div></div>
          <div className="kpi"><div className="label">Proyección anual</div><div className="value">{fmtMoney(proyeccionAnual)}</div></div>
          {mesMayorGasto && (
            <div className="kpi"><div className="label">Mes de mayor gasto</div><div className="value" style={{ fontSize: 16 }}>{periodoLabel(mesMayorGasto.periodo)}</div></div>
          )}
          {servicioMayorIncremento && (
            <div className="kpi">
              <div className="label">Servicio con mayor alza</div>
              <div className="value" style={{ fontSize: 16, color: 'var(--red)' }}>{servicioMayorIncremento.servicio} ▲ {fmtPct(servicioMayorIncremento.variacionPct)}</div>
            </div>
          )}
        </div>
      )}

      <SubirFacturas inmueblesPorContrato={inmueblesPorContrato} municipioLabel={municipioLabel} />

      {isAdmin && pendientesExtraccion.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>Extraer datos con IA</h3></div>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
            Lee cada factura (PDF o imagen) con IA para sacar el valor a pagar, el consumo y la fecha de
            vencimiento, y así poder comparar gastos sin abrir cada archivo. Hay <b>{pendientesExtraccion.length}</b>{' '}
            factura{pendientesExtraccion.length === 1 ? '' : 's'} sin extraer todavía.
          </div>
          <button className="btn" type="button" onClick={handleExtraerPendientes} disabled={extrayendoTodo}>
            {extrayendoTodo
              ? `Extrayendo… (${progresoExtraccion?.done || 0}/${progresoExtraccion?.total || 0})`
              : `Extraer ${pendientesExtraccion.length} factura(s) pendiente(s)`}
          </button>
        </div>
      )}

      {consolidadoMensual.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>Consolidado mensual</h3></div>
          {ultimaSubida?.subio && (
            <div className="alert-card sev-high" style={{ marginBottom: 14 }}>
              <div className="alert-icon">▲</div>
              <div className="alert-body">
                <div className="alert-title">El gasto subió respecto al mes anterior</div>
                <div className="alert-desc">
                  {periodoLabel(ultimaSubida.periodo)}: {fmtMoney(ultimaSubida.valor)} — {fmtPct(ultimaSubida.variacionPct)} más
                  que {periodoLabel(consolidadoMensual[consolidadoMensual.length - 2]?.periodo)} ({fmtMoney(ultimaSubida.anterior)}).
                </div>
              </div>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th style={{ textAlign: 'left' }}>Mes</th><th>Gasto total</th><th>Variación vs. mes anterior</th></tr>
              </thead>
              <tbody>
                {[...consolidadoMensual].reverse().map((m) => (
                  <tr key={m.periodo}>
                    <td className="name">{periodoLabel(m.periodo)}</td>
                    <td>{fmtMoney(m.valor)}</td>
                    <td style={{ color: m.subio ? 'var(--red)' : m.variacionPct !== null ? 'var(--green)' : 'var(--text-dimmer)', fontWeight: m.subio ? 700 : 400 }}>
                      {m.variacionPct !== null ? `${m.subio ? '▲' : '▼'} ${fmtPct(m.variacionPct)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resumenGasto.filas.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>Gasto por servicio</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {resumenGasto.filas.map(([servicio, valor]) => {
              const max = Math.max(1, ...resumenGasto.filas.map((x) => x[1]));
              return (
                <div key={servicio} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 100, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{servicio}</div>
                  <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden', height: 22 }}>
                    <div style={{ width: `${(valor / max) * 100}%`, background: 'var(--gold)', height: '100%', minWidth: 3 }} />
                  </div>
                  <div style={{ width: 140, flexShrink: 0, fontSize: 12.5, textAlign: 'right' }}><b>{fmtMoney(valor)}</b></div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-dimmer)', marginTop: 10 }}>
            Calculado sobre {resumenGasto.conDatos} de {filtradas.length} facturas del filtro actual que ya tienen datos extraídos.
          </div>
        </div>
      )}

      {consolidadoPorServicio.filas.length > 0 && consolidadoPorServicio.periodos.length > 1 && (
        <div className="panel">
          <div className="panel-head"><h3>Gasto por servicio — mes a mes</h3></div>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14 }}>
            Compara cada servicio mes a mes para ver cuál sube o baja. El último mes en rojo cuando subió respecto al anterior.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Servicio</th>
                  {consolidadoPorServicio.periodos.map((p) => <th key={p}>{periodoLabel(p)}</th>)}
                  <th>Variación</th>
                </tr>
              </thead>
              <tbody>
                {consolidadoPorServicio.filas.map((fila) => (
                  <tr key={fila.servicio}>
                    <td className="name">{fila.servicio}</td>
                    {fila.valores.map((v, i) => (
                      <td
                        key={i}
                        style={i === fila.valores.length - 1 ? { color: fila.subio ? 'var(--red)' : undefined, fontWeight: fila.subio ? 700 : 400 } : undefined}
                      >
                        {v > 0 ? fmtMoney(v) : '—'}
                      </td>
                    ))}
                    <td style={{ color: fila.subio ? 'var(--red)' : fila.variacionPct !== null ? 'var(--green)' : 'var(--text-dimmer)', fontWeight: fila.subio ? 700 : 400 }}>
                      {fila.variacionPct !== null ? `${fila.subio ? '▲' : '▼'} ${fmtPct(fila.variacionPct)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {topContratos.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>Top contratos por gasto</h3></div>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14 }}>
            Los 10 contratos con mayor gasto acumulado en el filtro actual — útil para detectar consumos altos o incrementos puntuales.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Contrato</th><th style={{ textAlign: 'left' }}>Propietario / dirección</th>
                  <th>Facturas</th><th>Gasto total</th><th>Último mes</th><th>Variación</th>
                </tr>
              </thead>
              <tbody>
                {topContratos.map((c) => {
                  const info = inmueblesPorContrato.get(c.contrato);
                  return (
                    <tr key={c.contrato}>
                      <td>{c.contrato}</td>
                      <td className="name">{info ? `${info.propietario || '—'} · ${info.direccion || ''}` : '—'}</td>
                      <td>{c.facturas}</td>
                      <td><b>{fmtMoney(c.total)}</b></td>
                      <td>{c.ultimo > 0 ? fmtMoney(c.ultimo) : '—'}</td>
                      <td style={{ color: c.subio ? 'var(--red)' : c.variacionPct !== null ? 'var(--green)' : 'var(--text-dimmer)', fontWeight: c.subio ? 700 : 400 }}>
                        {c.variacionPct !== null ? `${c.subio ? '▲' : '▼'} ${fmtPct(c.variacionPct)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>Filtros</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-outline" type="button" onClick={limpiarFiltros}>Limpiar filtros</button>
            <button className="btn-outline" type="button" onClick={handleExportExcel} disabled={filtradas.length === 0}>⭳ Descargar Excel</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Periodo</div>
            <select value={fPeriodo} onChange={(e) => setFPeriodo(e.target.value)}>
              <option value="__ALL__">Todos</option>
              {periodos.map((p) => <option key={p} value={p}>{periodoLabel(p)}</option>)}
            </select>
          </div>
          {!municipioFiltro && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Municipio</div>
              <select value={fMunicipio} onChange={(e) => setFMunicipio(e.target.value)}>
                <option value="__ALL__">Todos</option>
                {municipiosOpciones.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Servicio</div>
            <select value={fServicio} onChange={(e) => setFServicio(e.target.value)}>
              <option value="__ALL__">Todos</option>
              {SERVICIOS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Buscar contrato / propietario / dirección</div>
            <input type="text" value={fBusqueda} onChange={(e) => setFBusqueda(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Facturas</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="hint">{filtradas.length} {filtradas.length === 1 ? 'registro' : 'registros'}</span>
            {isAdmin && facturasDelEspacio.length > 0 && (
              <button className="btn-outline" type="button" onClick={handleEliminarTodas} disabled={borrandoTodo} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                {borrandoTodo ? `Eliminando… (${progresoBorrado?.done || 0}/${progresoBorrado?.total || 0})` : `🗑 Eliminar todas (${facturasDelEspacio.length})`}
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <div className="empty-note">Cargando…</div>
        ) : facturasDelEspacio.length === 0 ? (
          <div className="empty-note">Aún no hay facturas cargadas{isAdmin ? '. Súbelas arriba para empezar.' : '.'}</div>
        ) : filtradas.length === 0 ? (
          <div className="empty-note">Ninguna factura coincide con los filtros.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Periodo</th><th>Contrato</th><th style={{ textAlign: 'left' }}>Propietario / dirección</th>
                  <th>Municipio</th><th>Servicio</th><th>Valor</th><th>Consumo</th><th>Vence</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((f) => {
                  const info = inmueblesPorContrato.get(f.contrato);
                  const extrayendo = extrayendoId === f.id;
                  return (
                    <tr key={f.id}>
                      <td>{periodoLabel(f.periodo)}</td>
                      <td>{f.contrato}</td>
                      <td className="name">{info ? `${info.propietario || '—'} · ${info.direccion || ''}` : <span style={{ color: 'var(--red)' }}>Contrato no encontrado</span>}</td>
                      <td>{f.municipio || info?.municipio || '—'}</td>
                      {f.desglose?.length > 1 ? (
                        <>
                          <td style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                            {f.desglose.map((d, i) => <div key={i}>{d.servicio}</div>)}
                            {f.subunidad && <div style={{ fontSize: 10.5, color: 'var(--text-dimmer)' }}>{f.subunidad}</div>}
                          </td>
                          <td style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                            {f.desglose.map((d, i) => <div key={i}>{d.valor ? fmtMoney(d.valor) : '—'}</div>)}
                            <div style={{ fontWeight: 700, borderTop: '1px solid var(--border)', marginTop: 2, paddingTop: 2 }}>{fmtMoney(f.valorTotal)}</div>
                          </td>
                          <td style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                            {f.desglose.map((d, i) => <div key={i}>{d.consumo ? `${fmtNum(d.consumo)} ${d.unidadConsumo || ''}` : '—'}</div>)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{f.servicio}{f.subunidad ? <div style={{ fontSize: 10.5, color: 'var(--text-dimmer)' }}>{f.subunidad}</div> : null}</td>
                          <td>{f.valorTotal ? fmtMoney(f.valorTotal) : '—'}</td>
                          <td>{(f.desglose?.[0]?.consumo ?? f.consumo) ? `${fmtNum(f.desglose?.[0]?.consumo ?? f.consumo)} ${f.desglose?.[0]?.unidadConsumo || f.unidadConsumo || ''}` : '—'}</td>
                        </>
                      )}
                      <td>{f.fechaVencimiento || '—'}</td>
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <a className="btn-outline" href={f.archivo?.src} target="_blank" rel="noopener noreferrer">Ver</a>
                        {isAdmin && esExtraible(f.archivo) && (
                          <button
                            className="btn-outline" onClick={() => handleExtraerUna(f)} disabled={extrayendo || extrayendoTodo}
                            title={f.errorExtraccion || undefined}
                            style={{ borderColor: f.errorExtraccion ? 'var(--red)' : undefined }}
                          >
                            {extrayendo ? 'Extrayendo…' : f.errorExtraccion ? '⚠ Reintentar' : f.extraido ? 'Re-extraer' : 'Extraer datos'}
                          </button>
                        )}
                        {isAdmin && <button className="btn-outline" onClick={() => handleEliminar(f)}>Eliminar</button>}
                      </td>
                    </tr>
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

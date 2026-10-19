'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { fmtMoney, fmtNum } from '@/lib/dataHelpers';

const ESTADOS_SUGERIDOS = ['Vencidos', 'Enchapes', 'En trámite', 'Prórroga', 'Resuelto'];

const FORM_VACIO = { jefeZonal: '', categoria: '', cantidadContratos: '', fechaDesde: '', fechaHasta: '', estado: '', valor: '', notas: '' };

export default function ProcesoJuridicoPage() {
  const { isAdmin } = useAuth();
  const { procesoJuridico, addProcesoJuridico, updateProcesoJuridico, deleteProcesoJuridico } = useData();

  const [form, setForm] = useState(FORM_VACIO);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filterJefe, setFilterJefe] = useState('__ALL__');

  const jefes = useMemo(
    () => [...new Set(procesoJuridico.map((r) => r.jefeZonal).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [procesoJuridico]
  );

  const filtrados = useMemo(
    () => procesoJuridico.filter((r) => filterJefe === '__ALL__' || r.jefeZonal === filterJefe),
    [procesoJuridico, filterJefe]
  );

  const kpis = useMemo(() => {
    const totalContratos = filtrados.reduce((s, r) => s + (r.cantidadContratos || 0), 0);
    const valorTotal = filtrados.reduce((s, r) => s + (r.valor || 0), 0);
    const jefesInvolucrados = new Set(filtrados.map((r) => r.jefeZonal).filter(Boolean)).size;
    return { registros: filtrados.length, totalContratos, valorTotal, jefesInvolucrados };
  }, [filtrados]);

  const porJefe = useMemo(() => {
    const grupos = {};
    for (const r of filtrados) {
      const key = r.jefeZonal || 'Sin asignar';
      if (!grupos[key]) grupos[key] = { jefeZonal: key, registros: [], totalContratos: 0, valorTotal: 0 };
      grupos[key].registros.push(r);
      grupos[key].totalContratos += r.cantidadContratos || 0;
      grupos[key].valorTotal += r.valor || 0;
    }
    return Object.values(grupos).sort((a, b) => b.valorTotal - a.valorTotal);
  }, [filtrados]);

  function rangoFechas(r) {
    if (r.fechaDesde && r.fechaHasta) return `${r.fechaDesde}/${r.fechaHasta}`;
    return r.fechaDesde || r.fechaHasta || '—';
  }

  function editar(r) {
    setEditId(r.id);
    setForm({
      jefeZonal: r.jefeZonal || '', categoria: r.categoria || '', cantidadContratos: r.cantidadContratos ?? '',
      fechaDesde: r.fechaDesde || '', fechaHasta: r.fechaHasta || '', estado: r.estado || '',
      valor: r.valor ?? '', notas: r.notas || '',
    });
  }

  function cancelarEdicion() {
    setEditId(null);
    setForm(FORM_VACIO);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.jefeZonal.trim() || !form.categoria.trim()) {
      setError('El Jefe Zonal y la categoría son obligatorios.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const entry = {
        jefeZonal: form.jefeZonal.trim(), categoria: form.categoria.trim(),
        cantidadContratos: parseInt(form.cantidadContratos, 10) || 0,
        fechaDesde: form.fechaDesde.trim(), fechaHasta: form.fechaHasta.trim(),
        estado: form.estado.trim(), valor: parseFloat(form.valor) || 0, notas: form.notas.trim(),
      };
      if (editId) await updateProcesoJuridico(editId, entry);
      else await addProcesoJuridico(entry);
      cancelarEdicion();
    } catch (err) {
      setError('No se pudo guardar el registro: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleExportExcel() {
    const rows = filtrados.map((r) => ({
      'Jefe Zonal': r.jefeZonal, Categoría: r.categoria, 'Cantidad contratos': r.cantidadContratos,
      'Fecha desde': r.fechaDesde, 'Fecha hasta': r.fechaHasta, 'Estado / Asignación': r.estado,
      Valor: r.valor, Notas: r.notas,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Proceso juridico');
    XLSX.writeFile(wb, `proceso_juridico_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Proceso jurídico</h1><p>Contratos en proceso jurídico, por Jefe Zonal — cantidad, estado y valor en juego</p></div>
      </div>

      {!isAdmin && (
        <div className="readonly-banner">
          Tu rol es de <b>solo lectura</b>: puedes ver todos los registros, pero agregar, editar o eliminar solo lo puede hacer un administrador.
        </div>
      )}

      {error && <div className="login-error">{error}</div>}

      <div className="kpi-row">
        <div className="kpi"><div className="label">Registros</div><div className="value">{fmtNum(kpis.registros)}</div></div>
        <div className="kpi"><div className="label">Contratos en proceso jurídico</div><div className="value">{fmtNum(kpis.totalContratos)}</div></div>
        <div className="kpi"><div className="label">Valor en juego</div><div className="value">{fmtMoney(kpis.valorTotal)}</div></div>
        <div className="kpi"><div className="label">Jefes zonales involucrados</div><div className="value">{kpis.jefesInvolucrados}</div></div>
      </div>

      {isAdmin && (
        <div className="panel">
          <div className="panel-head"><h3>{editId ? 'Editar registro' : 'Nuevo registro'}</h3></div>
          <form onSubmit={handleSubmit} className="form-grid">
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Jefe Zonal</div>
              <input type="text" placeholder="Ej: Cristian Cruz" value={form.jefeZonal} onChange={(e) => setForm({ ...form, jefeZonal: e.target.value })} list="jefes-zonales" style={{ width: '100%' }} />
              <datalist id="jefes-zonales">{jefes.map((j) => <option key={j} value={j} />)}</datalist>
            </div>
            <div className="fg-span2">
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Categoría</div>
              <input type="text" placeholder="Ej: Compraventa Medellín" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Cantidad de contratos</div>
              <input type="number" min="0" placeholder="0" value={form.cantidadContratos} onChange={(e) => setForm({ ...form, cantidadContratos: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Fecha de contrato desde</div>
              <input type="text" placeholder="Ej: 2017" value={form.fechaDesde} onChange={(e) => setForm({ ...form, fechaDesde: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Fecha de contrato hasta</div>
              <input type="text" placeholder="Ej: 2022" value={form.fechaHasta} onChange={(e) => setForm({ ...form, fechaHasta: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Estado / Asignación</div>
              <input type="text" placeholder="Ej: Vencidos" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} list="estados-sugeridos" style={{ width: '100%' }} />
              <datalist id="estados-sugeridos">{ESTADOS_SUGERIDOS.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Valor</div>
              <input type="number" step="any" placeholder="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div className="fg-span5">
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Notas (opcional)</div>
              <input type="text" placeholder="Ej: dos de ellos son enchape por un exempleado 2016" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" type="submit" disabled={saving}>{saving ? 'Guardando…' : editId ? 'Guardar cambios' : '+ Agregar'}</button>
              {editId && <button className="btn-outline" type="button" onClick={cancelarEdicion}>Cancelar</button>}
            </div>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>Por Jefe Zonal</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select value={filterJefe} onChange={(e) => setFilterJefe(e.target.value)}>
              <option value="__ALL__">Todos los jefes zonales</option>
              {jefes.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
            <button className="btn-outline" type="button" onClick={handleExportExcel} disabled={filtrados.length === 0}>⭳ Descargar Excel</button>
          </div>
        </div>

        {porJefe.length === 0 ? (
          <div className="empty-note">Aún no hay registros{isAdmin ? '. Agrega el primero arriba.' : '.'}</div>
        ) : (
          porJefe.map((g) => (
            <div key={g.jefeZonal} style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{g.jefeZonal}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                  {fmtNum(g.totalContratos)} {g.totalContratos === 1 ? 'contrato' : 'contratos'} en proceso jurídico · {fmtMoney(g.valorTotal)}
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Categoría</th><th>Cantidad</th><th>Fecha contrato</th>
                      <th>Estado / Asignación</th><th>Valor</th><th style={{ textAlign: 'left' }}>Notas</th>
                      {isAdmin && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {g.registros.map((r) => (
                      <tr key={r.id}>
                        <td className="name">{r.categoria}</td>
                        <td>{fmtNum(r.cantidadContratos)}</td>
                        <td>{rangoFechas(r)}</td>
                        <td>{r.estado || '—'}</td>
                        <td>{fmtMoney(r.valor)}</td>
                        <td>{r.notas || '—'}</td>
                        {isAdmin && (
                          <td style={{ display: 'flex', gap: 6 }}>
                            <button className="btn-outline" onClick={() => editar(r)}>Editar</button>
                            <button className="btn-outline" onClick={() => deleteProcesoJuridico(r.id)}>Eliminar</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import ChartCanvas from '@/components/charts/ChartCanvas';
import { BRANCHES, BRANCH_COLOR, fmtMoney, fmtMoneyShort, MONTH_NAMES_FULL } from '@/lib/dataHelpers';

const MAX_PHOTO_BYTES = 700 * 1024; // ~700KB por foto: Firestore limita cada documento a 1MB total

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MEDIOS = ['Facebook', 'Instagram', 'TikTok', 'Google Ads', 'Volantes / impresos', 'Radio', 'Otro'];

function monthKey(fecha) { return fecha ? fecha.slice(0, 7) : '—'; }
function monthKeyLabel(key) {
  if (key === '—') return 'Sin fecha';
  const [y, m] = key.split('-');
  return `${MONTH_NAMES_FULL[parseInt(m, 10) - 1]} ${y}`;
}

export default function PublicidadPage() {
  const { isAdmin } = useAuth();
  const { publicidad, pendientes, addPublicidad, deletePublicidad, addPendiente, togglePendiente, deletePendiente } = useData();

  const [filterBranch, setFilterBranch] = useState('__ALL__');
  const [form, setForm] = useState({ branch: BRANCHES[0], fecha: '', medio: 'Facebook', costo: '', desc: '' });
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [pendForm, setPendForm] = useState({ texto: '', branch: '', fecha: '' });

  const curMonthKey = new Date().toISOString().slice(0, 7);
  const totalMes = publicidad.filter((p) => monthKey(p.fecha) === curMonthKey).reduce((s, p) => s + (p.costo || 0), 0);
  const totalHistorico = publicidad.reduce((s, p) => s + (p.costo || 0), 0);
  const countMes = publicidad.filter((p) => monthKey(p.fecha) === curMonthKey).length;
  const pendientesAbiertos = pendientes.filter((p) => !p.done).length;

  const keys = useMemo(() => [...new Set(publicidad.map((p) => monthKey(p.fecha)))].sort(), [publicidad]);
  const datasets = BRANCHES.map((b) => ({
    label: b, backgroundColor: BRANCH_COLOR[b],
    data: keys.map((k) => publicidad.filter((p) => p.branch === b && monthKey(p.fecha) === k).reduce((s, p) => s + (p.costo || 0), 0)),
  }));

  async function handleAddPub(e) {
    e.preventDefault();
    if (!form.fecha) { alert('Elige la fecha en que se hizo la publicidad.'); return; }

    const tooBig = files.find((f) => f.size > MAX_PHOTO_BYTES);
    if (tooBig) {
      alert(`La foto "${tooBig.name}" pesa demasiado (máx. ~700KB por foto mientras no tengamos Firebase Storage activado). Intenta con una imagen más liviana o comprimida.`);
      return;
    }

    setUploading(true);
    try {
      const photoUrls = [];
      for (const file of files) {
        photoUrls.push(await readFileAsDataURL(file));
      }
      await addPublicidad({
        branch: form.branch, fecha: form.fecha, medio: form.medio,
        costo: parseFloat(form.costo) || 0, desc: form.desc.trim(), photos: photoUrls,
      });
      setForm({ branch: form.branch, fecha: '', medio: form.medio, costo: '', desc: '' });
      setFiles([]);
    } catch (err) {
      alert('No se pudo guardar el registro: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleAddPend(e) {
    e.preventDefault();
    if (!pendForm.texto.trim()) return;
    await addPendiente({ texto: pendForm.texto.trim(), branch: pendForm.branch, fecha: pendForm.fecha });
    setPendForm({ texto: '', branch: pendForm.branch, fecha: '' });
  }

  const list = publicidad
    .slice()
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .filter((p) => filterBranch === '__ALL__' || p.branch === filterBranch);

  const pendList = pendientes.slice().sort((a, b) => (a.done - b.done) || (a.fecha || '9999').localeCompare(b.fecha || '9999'));

  return (
    <div>
      <div className="topbar">
        <div><h1>Publicidad y pendientes</h1><p>Registra qué días se hizo publicidad, adjunta las fotos, controla el gasto del mes y lleva tus pendientes</p></div>
      </div>

      {!isAdmin && (
        <div className="readonly-banner">
          Tu rol es de <b>solo lectura</b>: puedes ver todos los registros y el gasto, pero agregar, editar o eliminar solo lo puede hacer un administrador.
        </div>
      )}

      <div className="kpi-row">
        <div className="kpi"><div className="label">Gastado este mes</div><div className="value">{fmtMoney(totalMes)}</div></div>
        <div className="kpi"><div className="label">Gastado histórico</div><div className="value">{fmtMoney(totalHistorico)}</div></div>
        <div className="kpi"><div className="label">Publicaciones este mes</div><div className="value">{countMes}</div></div>
        <div className="kpi"><div className="label">Pendientes abiertos</div><div className="value">{pendientesAbiertos}</div></div>
      </div>

      {isAdmin && (
        <div className="panel">
          <div className="panel-head"><h3>Nuevo registro de publicidad</h3></div>
          <form onSubmit={handleAddPub} style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Sucursal</div>
              <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} style={{ width: '100%' }}>
                {BRANCHES.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Fecha</div>
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Medio</div>
              <select value={form.medio} onChange={(e) => setForm({ ...form, medio: e.target.value })} style={{ width: '100%' }}>
                {MEDIOS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Costo</div>
              <input type="number" step="any" placeholder="0" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Descripción</div>
              <input type="text" placeholder="Ej: promo de julio" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div style={{ gridColumn: 'span 5' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Fotos (opcional, máx. ~700KB cada una)</div>
              <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files))} style={{ fontSize: 11.5, color: 'var(--text-dim)' }} />
            </div>
            <button className="btn" type="submit" disabled={uploading}>{uploading ? 'Guardando…' : '+ Agregar'}</button>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h3>Gasto en publicidad por mes</h3></div>
        <ChartCanvas
          height={90}
          config={{
            type: 'bar',
            data: { labels: keys.map(monthKeyLabel), datasets },
            options: {
              plugins: { legend: { labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmtMoney(c.raw) } } },
              scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => fmtMoneyShort(v) } } },
            },
          }}
        />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Registros</h3>
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
            <option value="__ALL__">Todas las sucursales</option>
            {BRANCHES.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        {list.length === 0 ? (
          <div className="empty-note">Aún no hay registros de publicidad{isAdmin ? '. Agrega el primero arriba.' : '.'}</div>
        ) : (
          list.map((p) => (
            <div className="alert-card sev-low" key={p.id} style={{ borderLeftColor: BRANCH_COLOR[p.branch] }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div className="alert-title"><span className="tag-dot" style={{ background: BRANCH_COLOR[p.branch] }} />{p.fecha} · {p.branch} · {p.medio}</div>
                    <div className="alert-desc">{p.desc || '(sin descripción)'} — {fmtMoney(p.costo)}</div>
                  </div>
                  {isAdmin && <button className="btn-outline" onClick={() => deletePublicidad(p.id)}>Eliminar</button>}
                </div>
                {p.photos?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {p.photos.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="" onClick={() => window.open(src, '_blank')}
                        style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Pendientes</h3></div>
        {isAdmin && (
          <form onSubmit={handleAddPend} style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <select value={pendForm.branch} onChange={(e) => setPendForm({ ...pendForm, branch: e.target.value })} style={{ minWidth: 150 }}>
              <option value="">General</option>
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
            <input type="text" placeholder="¿Qué falta por hacer?" value={pendForm.texto} onChange={(e) => setPendForm({ ...pendForm, texto: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
            <input type="date" value={pendForm.fecha} onChange={(e) => setPendForm({ ...pendForm, fecha: e.target.value })} />
            <button className="btn" type="submit">+ Agregar pendiente</button>
          </form>
        )}
        {pendList.length === 0 ? (
          <div className="empty-note">No hay pendientes registrados.</div>
        ) : (
          pendList.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <input type="checkbox" checked={!!p.done} disabled={!isAdmin} onChange={() => togglePendiente(p.id, !p.done)} style={{ width: 16, height: 16, accentColor: 'var(--gold)' }} />
              <div style={{ flex: 1, fontSize: 13, textDecoration: p.done ? 'line-through' : 'none', color: p.done ? 'var(--text-dimmer)' : 'var(--text)' }}>
                {p.texto} {p.branch && <span className="pill neu">{p.branch}</span>} {p.fecha && <span style={{ color: 'var(--text-dimmer)', fontSize: 11.5 }}> · vence {p.fecha}</span>}
              </div>
              {isAdmin && <button className="btn-outline" onClick={() => deletePendiente(p.id)}>Eliminar</button>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import RequireAdmin from '@/components/RequireAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { BRANCHES, EDIT_METRICS, METRIC_LABEL, MONTH_NAMES, series } from '@/lib/dataHelpers';

function ImportarExcel() {
  const { getIdToken } = useAuth();
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleImport() {
    if (!file) { setError('Elige primero un archivo .xlsx'); return; }
    setImporting(true);
    setError('');
    setResult(null);
    try {
      const token = await getIdToken();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import-excel', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al importar');
      setResult(data);
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Importar desde Excel</h3></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
        Sube el archivo de control interno (mismo formato de siempre: hojas BARRANQUILLA, CAUCASIA,
        EURO, HEROICA, SINU y SEMANALES). Los datos que traiga <b>reemplazan</b> lo que ya estÃ¡
        guardado para esos meses y sucursales â€” asÃ­ que si solo quieres corregir un par de valores,
        es mÃ¡s rÃ¡pido hacerlo en la tabla de abajo.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0] || null)} style={{ fontSize: 12, color: 'var(--text-dim)' }} />
        <button className="btn" onClick={handleImport} disabled={importing || !file}>
          {importing ? 'Importandoâ€¦' : 'Importar archivo'}
        </button>
      </div>
      {error && <div className="login-error">{error}</div>}
      {result && (
        <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 12 }}>
          Listo: se cargaron {result.monthlyCount} registros mensuales
          ({result.branches.join(', ')}) y {result.weeklyCount} reportes semanales.
        </div>
      )}
    </div>
  );
}

function EditarInner() {
  const { monthly, saveMonthlyMetric } = useData();
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [year, setYear] = useState('2026');
  const [draft, setDraft] = useState(null); // {metric: [12 valores]} mientras se edita
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  function valueFor(metric, m) {
    if (draft && draft[metric]) return draft[metric][m];
    return series(monthly, branch, year, metric)[m];
  }

  function handleChange(metric, m, value) {
    setDraft((prev) => {
      const base = prev || {};
      const arr = base[metric] ? [...base[metric]] : [...series(monthly, branch, year, metric)];
      arr[m] = value === '' ? 0 : parseFloat(value);
      return { ...base, [metric]: arr };
    });
  }

  async function handleSave() {
    if (!draft) { setStatus('No hay cambios que guardar.'); return; }
    setSaving(true);
    try {
      for (const metric of Object.keys(draft)) {
        await saveMonthlyMetric(branch, year, metric, draft[metric]);
      }
      setDraft(null);
      setStatus(`Cambios guardados para ${branch} Â· ${year}.`);
    } catch (err) {
      setStatus('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 5000);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Editar datos</h1><p>Corrige un valor o carga el mes que acabas de cerrar â€” se guarda directo en la base de datos</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={branch} onChange={(e) => { setBranch(e.target.value); setDraft(null); }}>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select>
          <select value={year} onChange={(e) => { setYear(e.target.value); setDraft(null); }}><option value="2026">2026</option><option value="2025">2025</option></select>
        </div>
      </div>

      <div className="readonly-banner">
        Estos cambios se guardan directamente en Firestore y los verÃ¡ cualquier persona con acceso al panel, en tiempo real.
      </div>

      <ImportarExcel />

      <div className="panel">
        <div className="panel-head">
          <h3>Valores mensuales Â· {branch} Â· {year}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={handleSave} disabled={saving}>{saving ? 'Guardandoâ€¦' : 'Guardar cambios'}</button>
            <button className="btn-outline" onClick={() => setDraft(null)}>Descartar cambios</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th style={{ textAlign: 'left' }}>MÃ©trica</th>{MONTH_NAMES.map((m) => <th key={m}>{m}</th>)}</tr></thead>
            <tbody>
              {EDIT_METRICS.map((metric) => (
                <tr key={metric}>
                  <td className="name">{METRIC_LABEL[metric]}</td>
                  {Array.from({ length: 12 }).map((_, m) => (
                    <td key={m}>
                      <input
                        type="number" step="any"
                        value={valueFor(metric, m)}
                        onChange={(e) => handleChange(metric, m, e.target.value)}
                        style={{ width: 88, textAlign: 'right' }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {status && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 10 }}>{status}</div>}
      </div>
    </div>
  );
}

export default function EditarPage() {
  return (
    <RequireAdmin>
      <EditarInner />
    </RequireAdmin>
  );
}
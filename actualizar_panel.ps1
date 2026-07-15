# --- crear carpetas necesarias ---
New-Item -ItemType Directory -Force -Path "src\app\api\import-excel" | Out-Null
New-Item -ItemType Directory -Force -Path "src\app\api\analysis" | Out-Null
New-Item -ItemType Directory -Force -Path "src\app\(dashboard)\analisis" | Out-Null

# --- escribir archivos ---
[System.IO.File]::WriteAllText("$PWD\package.json", @'
{
  "name": "joyerias-panel",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "seed": "node scripts/seedData.js"
  },
  "dependencies": {
    "next": "14.2.35",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "firebase": "10.12.4",
    "firebase-admin": "12.3.0",
    "chart.js": "4.4.4",
    "xlsx": "0.18.5"
  },
  "devDependencies": {
    "dotenv": "16.4.5"
  },
  "engines": {
    "node": ">=18.18.0"
  }
}
'@)

[System.IO.File]::WriteAllText("$PWD\src\lib\excelParser.js", @'
// Extrae los datos mensuales y semanales del archivo Excel de control interno.
// Reproduce exactamente la misma lógica que usamos para la carga inicial
// (hojas BARRANQUILLA / CAUCASIA / EURO / HEROICA / SINU con dos bloques de
// filas —2025 y 2026— y la hoja SEMANALES con reportes de avance).
// Solo se importa desde código de SERVIDOR (API routes), nunca desde el cliente.

import * as XLSX from 'xlsx';

const METRIC_ROWS_2025 = {
  gr_contrato: 5, valor_contratado: 6, utilidad: 7, prorroga: 8,
  venta_oro: 9, valor_venta_oro: 10, venta_plata: 11, valor_venta_plata: 12,
  operacion_efecty: 13, cantidad_efecty: 14, operacion_sistecredito: 15, cantidad_sistecredito: 16,
};
const METRIC_ROWS_2026 = Object.fromEntries(Object.entries(METRIC_ROWS_2025).map(([k, v]) => [k, v + 14]));

// Nombres de hoja normalizados (mayúsculas, sin espacios) -> nombre de sucursal.
const SHEET_BRANCH_MAP = {
  BARRANQUILLA: 'Barranquilla',
  CAUCASIA: 'Caucasia',
  EURO: 'Euro',
  HEROICA: 'Heroica',
  SINU: 'Sinú',
  SINÚ: 'Sinú',
};

/** Accede a una celda como openpyxl: cell(grid, fila, columna) con índices 1-based. */
function cell(grid, r, c) {
  const row = grid[r - 1];
  if (!row) return null;
  const v = row[c - 1];
  return v === undefined ? null : v;
}

/** Limpia valores: corrige errores de digitación tipo "1.999.66" -> 1999.66. */
function clean(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'string') {
    let s = v.trim();
    const parts = s.split('.');
    if (parts.length > 2) s = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
    const n = parseFloat(s.replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return v;
}

function sheetToGrid(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

export function parseMonthly(workbook) {
  const monthly = {};
  for (const rawName of workbook.SheetNames) {
    const key = rawName.trim().toUpperCase();
    const branch = SHEET_BRANCH_MAP[key];
    if (!branch) continue;
    const grid = sheetToGrid(workbook, rawName);
    if (!grid) continue;

    monthly[branch] = { 2025: {}, 2026: {} };
    for (const [year, rows] of [['2025', METRIC_ROWS_2025], ['2026', METRIC_ROWS_2026]]) {
      for (const [metric, r] of Object.entries(rows)) {
        const vals = [];
        for (let i = 0; i < 12; i++) vals.push(clean(cell(grid, r, 3 + i))); // columnas C..N = 12 meses
        monthly[branch][year][metric] = vals;
      }
    }
  }
  return monthly;
}

const WEEK_BRANCH_COLS = { Barranquillera: 2, Caucasia: 5, Euro: 8, Heroica: 11, Sinú: 14 };
const WEEK_METRICS_ORDER = [
  'gramos', 'valor_contratado', 'utilidad', 'prorroga', 'venta_oro', 'valor_venta_oro',
  'venta_plata', 'valor_venta_plata', 'efecty', 'cant_efecty', 'sistecredito', 'cant_sistecredito',
];

export function parseWeekly(workbook) {
  const sheetName = workbook.SheetNames.find((n) => n.trim().toUpperCase() === 'SEMANALES');
  if (!sheetName) return [];
  const grid = sheetToGrid(workbook, sheetName);
  if (!grid) return [];

  const weeks = [];
  let row = 2;
  const maxRow = grid.length;
  while (row <= maxRow) {
    const marker = cell(grid, row, 2);
    if (marker && String(marker).toUpperCase().includes('REPORTES')) {
      const fecha = cell(grid, row, 14) || `semana-fila-${row}`;
      const week = { fecha: String(fecha), sucursales: {} };
      for (const [branch, col] of Object.entries(WEEK_BRANCH_COLS)) {
        const vals = {};
        for (let i = 0; i < WEEK_METRICS_ORDER.length; i++) {
          vals[WEEK_METRICS_ORDER[i]] = clean(cell(grid, row + 2 + i, col + 1));
        }
        week.sucursales[branch] = vals;
      }
      weeks.push(week);
      row += 18;
    } else {
      row += 1;
    }
  }
  return weeks;
}

export function slugifyFecha(fecha) {
  return String(fecha).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function parseWorkbookBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const monthly = parseMonthly(workbook);
  const weekly = parseWeekly(workbook);
  return { monthly, weekly };
}
'@)

[System.IO.File]::WriteAllText("$PWD\src\app\api\import-excel\route.js", @'
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseWorkbookBuffer, slugifyFecha } from '@/lib/excelParser';

export const runtime = 'nodejs';

// POST /api/import-excel — recibe un archivo .xlsx (multipart/form-data, campo "file"),
// extrae los datos mensuales y semanales, y los sobreescribe en Firestore. Solo admin.
export async function POST(request) {
  try {
    await requireAdmin(request);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { monthly, weekly } = parseWorkbookBuffer(buffer);

    const branches = Object.keys(monthly);
    if (branches.length === 0) {
      return NextResponse.json({
        error: 'No se reconoció ninguna hoja de sucursal (se esperaba BARRANQUILLA, CAUCASIA, EURO, HEROICA o SINU).',
      }, { status: 400 });
    }

    let monthlyCount = 0;
    for (const branch of branches) {
      for (const year of Object.keys(monthly[branch])) {
        const docId = `${branch}_${year}`;
        await adminDb.collection('monthly').doc(docId).set({
          branch, year, metrics: monthly[branch][year],
        });
        monthlyCount++;
      }
    }

    let weeklyCount = 0;
    for (const week of weekly) {
      const docId = slugifyFecha(week.fecha);
      await adminDb.collection('weekly').doc(docId).set(week);
      weeklyCount++;
    }

    return NextResponse.json({ branches, monthlyCount, weeklyCount });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al importar el archivo' }, { status: err.status || 500 });
  }
}
'@)

[System.IO.File]::WriteAllText("$PWD\src\app\api\analysis\route.js", @'
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAuth } from '@/lib/apiAuth';
import {
  BRANCHES, MONTH_NAMES_FULL, fmtMoney, fmtGr,
  totalFor, totalAll, lastActiveMonth2026,
} from '@/lib/dataHelpers';

export const runtime = 'nodejs';

async function loadMonthly() {
  const snap = await adminDb.collection('monthly').get();
  const monthly = {};
  BRANCHES.forEach((b) => { monthly[b] = { 2025: {}, 2026: {} }; });
  snap.forEach((doc) => {
    const data = doc.data();
    if (!monthly[data.branch]) monthly[data.branch] = { 2025: {}, 2026: {} };
    monthly[data.branch][data.year] = data.metrics;
  });
  return monthly;
}

async function loadWeekly() {
  const snap = await adminDb.collection('weekly').orderBy('fecha').get();
  return snap.docs.map((d) => d.data());
}

function buildSummary(monthly, weekly) {
  const lastM = lastActiveMonth2026(monthly);
  const lines = [];
  lines.push(`Datos de Joyerías del Cesar (5 sucursales), año en curso 2026 hasta ${MONTH_NAMES_FULL[lastM]}, comparado con 2025.`);
  lines.push('');
  lines.push('=== Consolidado 2026 (Ene-' + MONTH_NAMES_FULL[lastM] + ') ===');
  lines.push(`Valor contratado total: ${fmtMoney(totalAll(monthly, '2026', 'valor_contratado', lastM + 1))}`);
  lines.push(`Utilidad total: ${fmtMoney(totalAll(monthly, '2026', 'utilidad', lastM + 1))}`);
  lines.push(`Gramos en contrato: ${fmtGr(totalAll(monthly, '2026', 'gr_contrato', lastM + 1))}`);
  lines.push(`Prórrogas totales: ${fmtMoney(totalAll(monthly, '2026', 'prorroga', lastM + 1))}`);
  lines.push('');
  lines.push('=== Por sucursal (2026 Ene-' + MONTH_NAMES_FULL[lastM] + ' vs. mismo periodo 2025) ===');
  BRANCHES.forEach((b) => {
    const cutoff = Math.min(lastM + 1, 6);
    const ut26 = totalFor(monthly, b, '2026', 'utilidad', lastM + 1);
    const ut25 = totalFor(monthly, b, '2025', 'utilidad', cutoff);
    const vc26 = totalFor(monthly, b, '2026', 'valor_contratado', lastM + 1);
    const pr26 = totalFor(monthly, b, '2026', 'prorroga', lastM + 1);
    const margen = vc26 ? (ut26 / vc26) * 100 : 0;
    lines.push(`- ${b}: utilidad 2026=${fmtMoney(ut26)} (2025 mismo periodo=${fmtMoney(ut25)}), valor contratado=${fmtMoney(vc26)}, margen=${margen.toFixed(1)}%, prórrogas=${fmtMoney(pr26)}`);
  });
  lines.push('');
  lines.push('=== Utilidad mes a mes 2026 (todas las sucursales) ===');
  for (let m = 0; m <= lastM; m++) {
    const ut = totalAll(monthly, '2026', 'utilidad', m + 1) - totalAll(monthly, '2026', 'utilidad', m);
    lines.push(`${MONTH_NAMES_FULL[m]}: ${fmtMoney(ut)}`);
  }
  if (weekly.length > 0) {
    lines.push('');
    lines.push('=== Últimos reportes semanales ===');
    weekly.slice(-2).forEach((w) => {
      lines.push(`Semana ${w.fecha}:`);
      Object.entries(w.sucursales || {}).forEach(([b, vals]) => {
        lines.push(`  - ${b}: utilidad=${fmtMoney(vals.utilidad || 0)}, valor contratado=${fmtMoney(vals.valor_contratado || 0)}`);
      });
    });
  }
  return lines.join('\n');
}

export async function POST(request) {
  try {
    await requireAuth(request);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno del servidor.',
      }, { status: 500 });
    }

    const [monthly, weekly] = await Promise.all([loadMonthly(), loadWeekly()]);
    const summary = buildSummary(monthly, weekly);

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        system: 'Eres un analista financiero que ayuda al dueño de una cadena de joyerías/casas de empeño en Colombia (préstamos sobre oro y plata) a entender sus números y tomar decisiones. Responde siempre en español, en prosa clara y directa, sin relleno. Estructura la respuesta en: 1) un resumen de 2-3 frases del panorama general, 2) qué sucursales van bien y cuáles necesitan atención (con la razón concreta, citando cifras), 3) 3 a 5 recomendaciones puntuales y accionables. No inventes datos que no estén en el resumen que te dan.',
        messages: [
          { role: 'user', content: `Aquí están los datos actuales del negocio:\n\n${summary}\n\nDame tu análisis y recomendaciones.` },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      return NextResponse.json({ error: `Error del servicio de análisis: ${errBody}` }, { status: 502 });
    }

    const data = await anthropicRes.json();
    const text = (data.content || []).map((b) => b.text || '').join('\n');

    return NextResponse.json({ analysis: text, generatedAt: Date.now() });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al generar el análisis' }, { status: err.status || 500 });
  }
}
'@)

[System.IO.File]::WriteAllText("$PWD\src\app\(dashboard)\editar\page.jsx", @'
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
        EURO, HEROICA, SINU y SEMANALES). Los datos que traiga <b>reemplazan</b> lo que ya está
        guardado para esos meses y sucursales — así que si solo quieres corregir un par de valores,
        es más rápido hacerlo en la tabla de abajo.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0] || null)} style={{ fontSize: 12, color: 'var(--text-dim)' }} />
        <button className="btn" onClick={handleImport} disabled={importing || !file}>
          {importing ? 'Importando…' : 'Importar archivo'}
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
      setStatus(`Cambios guardados para ${branch} · ${year}.`);
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
        <div><h1>Editar datos</h1><p>Corrige un valor o carga el mes que acabas de cerrar — se guarda directo en la base de datos</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={branch} onChange={(e) => { setBranch(e.target.value); setDraft(null); }}>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select>
          <select value={year} onChange={(e) => { setYear(e.target.value); setDraft(null); }}><option value="2026">2026</option><option value="2025">2025</option></select>
        </div>
      </div>

      <div className="readonly-banner">
        Estos cambios se guardan directamente en Firestore y los verá cualquier persona con acceso al panel, en tiempo real.
      </div>

      <ImportarExcel />

      <div className="panel">
        <div className="panel-head">
          <h3>Valores mensuales · {branch} · {year}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
            <button className="btn-outline" onClick={() => setDraft(null)}>Descartar cambios</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th style={{ textAlign: 'left' }}>Métrica</th>{MONTH_NAMES.map((m) => <th key={m}>{m}</th>)}</tr></thead>
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
'@)

[System.IO.File]::WriteAllText("$PWD\src\app\(dashboard)\analisis\page.jsx", @'
'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function AnalisisPage() {
  const { getIdToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState(null);

  async function handleGenerate() {
    setLoading(true);
    setError('');
    try {
      const token = await getIdToken();
      const res = await fetch('/api/analysis', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar el análisis');
      setAnalysis(data.analysis);
      setGeneratedAt(data.generatedAt);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Análisis con IA</h1>
          <p>Un resumen del panorama, qué sucursales necesitan atención, y recomendaciones concretas</p>
        </div>
        <button className="btn" onClick={handleGenerate} disabled={loading}>
          {loading ? 'Analizando…' : analysis ? 'Generar de nuevo' : 'Generar análisis'}
        </button>
      </div>

      {error && (
        <div className="panel" style={{ borderLeft: '3px solid var(--red)' }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>
          {error.includes('ANTHROPIC_API_KEY') && (
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.6 }}>
              Necesitas una clave de API de Anthropic para esta función: entra a{' '}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--gold-light)' }}>
                console.anthropic.com/settings/keys
              </a>{' '}
              , crea una clave, y agrégala como <code>ANTHROPIC_API_KEY</code> en tu <code>.env.local</code> y en las variables de entorno de Vercel.
            </div>
          )}
        </div>
      )}

      {!analysis && !error && !loading && (
        <div className="panel">
          <div className="empty-note">
            Todavía no has generado un análisis. Dale clic a "Generar análisis" — la IA va a revisar
            los datos actuales de las 5 sucursales y darte un resumen con recomendaciones.
          </div>
        </div>
      )}

      {loading && (
        <div className="panel">
          <div className="empty-note">Revisando los números de las 5 sucursales…</div>
        </div>
      )}

      {analysis && (
        <div className="panel">
          <div className="panel-head">
            <h3>Resultado</h3>
            {generatedAt && <span className="hint">Generado {new Date(generatedAt).toLocaleString('es-CO')}</span>}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
            {analysis}
          </div>
        </div>
      )}
    </div>
  );
}
'@)

[System.IO.File]::WriteAllText("$PWD\src\components\Sidebar.jsx", @'
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

const ITEMS = [
  { href: '/', label: 'Resumen general' },
  { href: '/comparativo', label: 'Comparativo sucursales' },
  { href: '/detalle', label: 'Detalle por sucursal' },
  { href: '/semanal', label: 'Seguimiento semanal' },
  { href: '/publicidad', label: 'Publicidad y pendientes' },
  { href: '/analisis', label: 'Análisis con IA' },
  { href: '/editar', label: 'Editar datos', adminOnly: true },
  { href: '/alertas', label: 'Alertas' },
  { href: '/admin/usuarios', label: 'Usuarios', adminOnly: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin, role, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="sidebar">
      <div className="brand" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div className="mark">Joyerías del Cesar</div>
          <div className="sub">Panel de control</div>
        </div>
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
            width: 30, height: 30, flexShrink: 0, cursor: 'pointer', color: 'var(--text-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      {ITEMS.map((item) => {
        if (item.adminOnly && !isAdmin) return null;
        const active = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`}>
            {item.label}
          </Link>
        );
      })}

      <div className="sidebar-foot">
        <div>Sesión: <b>{user?.email}</b></div>
        <div style={{ marginTop: 4 }}>Rol: <b>{role === 'admin' ? 'Administrador' : 'Operaciones (solo lectura)'}</b></div>
        <button className="btn-outline" style={{ marginTop: 10, width: '100%' }} onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
'@)

[System.IO.File]::WriteAllText("$PWD\src\app\globals.css", @'
:root{
  --bg:#12151c; --surface:#1a2029; --surface-2:#212838; --border:#2a3242;
  --text:#edeff3; --text-dim:#8d96ac; --text-dimmer:#5e6678;
  --gold:#c7a339; --gold-light:#e8cd7a; --gold-deep:#8a6a1f;
  --green:#4f9d69; --red:#c1443a;
  --shadow: 0 1px 0 rgba(255,255,255,0.03);
  color-scheme: dark;
}
:root[data-theme="light"]{
  --bg:#f6f4ef; --surface:#ffffff; --surface-2:#f0ece2; --border:#e2dcca;
  --text:#262319; --text-dim:#6b6555; --text-dimmer:#9a927c;
  --gold:#a9812a; --gold-light:#8a6a1f; --gold-deep:#6b5119;
  --green:#2f8f57; --red:#b23a2f;
  --shadow: 0 1px 2px rgba(30,25,10,0.06);
  color-scheme: light;
}
body, .kpi, .panel, .sidebar, select, input, .btn-outline, .alert-card{
  transition: background-color .2s ease, border-color .2s ease, color .2s ease;
}
*{box-sizing:border-box; margin:0; padding:0;}
html,body{height:100%;}
body{
  background:
    radial-gradient(ellipse 900px 500px at 85% -10%, rgba(199,163,57,0.10), transparent 60%),
    var(--bg);
  color:var(--text);
  font-family:'Inter',sans-serif;
  -webkit-font-smoothing:antialiased;
  min-height:100vh;
}
.tabular{font-family:'IBM Plex Mono',monospace; font-variant-numeric:tabular-nums;}
::-webkit-scrollbar{width:8px; height:8px;}
::-webkit-scrollbar-thumb{background:var(--border); border-radius:4px;}

.shell{display:flex; min-height:100vh;}

.sidebar{
  width:230px; flex-shrink:0;
  background:linear-gradient(180deg, #171c25, #12151c);
  border-right:1px solid var(--border);
  padding:26px 18px;
  display:flex; flex-direction:column; gap:6px;
  position:sticky; top:0; height:100vh;
}
.brand{margin-bottom:28px; padding:0 6px;}
.brand .mark{
  font-family:'Fraunces', serif; font-weight:700; font-size:22px; letter-spacing:0.01em;
  color:var(--gold-light); display:flex; align-items:center; gap:8px;
}
.brand .sub{font-size:11px; color:var(--text-dimmer); margin-top:4px; letter-spacing:0.06em; text-transform:uppercase;}

.nav-item{
  display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:8px;
  color:var(--text-dim); font-size:13.5px; font-weight:500; cursor:pointer; border:1px solid transparent;
  transition:background .15s, color .15s; text-decoration:none;
}
.nav-item:hover{background:var(--surface); color:var(--text);}
.nav-item.active{
  background:linear-gradient(90deg, rgba(199,163,57,0.16), rgba(199,163,57,0.03));
  color:var(--gold-light); border-color:rgba(199,163,57,0.25);
}
.nav-item.disabled{opacity:.35; pointer-events:none;}

.sidebar-foot{
  margin-top:auto; padding:12px; border-radius:10px; background:var(--surface); border:1px solid var(--border);
  font-size:11.5px; color:var(--text-dimmer); line-height:1.5;
}
.sidebar-foot b{color:var(--text-dim);}

.main{flex:1; min-width:0; padding:28px 34px 60px;}
.topbar{display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:26px; flex-wrap:wrap;}
.topbar h1{font-family:'Fraunces', serif; font-weight:600; font-size:26px;}
.topbar p{color:var(--text-dim); font-size:13.5px; margin-top:5px;}

.kpi-row{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:22px;}
.kpi{background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px 18px 16px; position:relative; overflow:hidden;}
.kpi::before{content:""; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg, var(--gold), transparent);}
.kpi .label{font-size:11.5px; color:var(--text-dim); text-transform:uppercase; letter-spacing:.05em; margin-bottom:10px;}
.kpi .value{font-family:'IBM Plex Mono',monospace; font-size:23px; font-weight:600; color:var(--text);}
.kpi .delta{font-size:12px; margin-top:8px; display:flex; align-items:center; gap:4px;}
.delta.up{color:var(--green);} .delta.down{color:var(--red);}

.panel{background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px 22px; margin-bottom:20px;}
.panel-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:12px; flex-wrap:wrap;}
.panel-head h3{font-size:14.5px; font-weight:600; color:var(--text);}
.panel-head .hint{font-size:11.5px; color:var(--text-dimmer);}

.grid-2{display:grid; grid-template-columns:1.3fr 1fr; gap:20px;}
@media (max-width:1080px){.grid-2{grid-template-columns:1fr;} .kpi-row{grid-template-columns:repeat(2,1fr);}}

select, input, .select{
  background:var(--surface-2); color:var(--text); border:1px solid var(--border); border-radius:7px;
  padding:7px 10px; font-size:12.5px; font-family:'Inter',sans-serif; cursor:pointer; outline:none;
}
select:focus, input:focus{border-color:var(--gold-deep);}

.btn{
  background:var(--gold); color:#1a1200; border:none; border-radius:7px; padding:8px 14px;
  font-weight:600; font-size:12.5px; cursor:pointer;
}
.btn-outline{
  background:var(--surface-2); color:var(--text-dim); border:1px solid var(--border); border-radius:7px;
  padding:8px 14px; font-size:12.5px; cursor:pointer;
}
.btn-group{display:flex; gap:4px; background:var(--surface-2); padding:3px; border-radius:8px; border:1px solid var(--border);}
.btn-toggle{padding:6px 12px; font-size:12px; border-radius:6px; cursor:pointer; color:var(--text-dim); font-weight:500; transition:background .15s, color .15s; border:none; background:none;}
.btn-toggle.active{background:var(--gold); color:#1a1200;}

.ingot-row{display:flex; align-items:center; gap:12px; margin-bottom:14px;}
.ingot-rank{font-family:'Fraunces',serif; font-size:15px; color:var(--text-dimmer); width:18px; flex-shrink:0;}
.ingot-name{width:98px; flex-shrink:0; font-size:12.5px; font-weight:600; color:var(--text);}
.ingot-track{flex:1; height:22px; background:var(--surface-2); border-radius:5px; overflow:hidden; position:relative; border:1px solid var(--border);}
.ingot-fill{
  height:100%; border-radius:5px 3px 3px 5px;
  background:linear-gradient(180deg, var(--gold-light) 0%, var(--gold) 45%, var(--gold-deep) 100%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -3px 4px rgba(0,0,0,0.35);
  position:relative; transition:width .6s ease;
}
.ingot-value{width:150px; text-align:right; flex-shrink:0; font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--gold-light);}

table{width:100%; border-collapse:collapse; font-size:12.5px;}
th{text-align:right; color:var(--text-dimmer); font-weight:600; font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; padding:8px 10px; border-bottom:1px solid var(--border);}
th:first-child, td:first-child{text-align:left;}
td{padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.04); text-align:right; font-family:'IBM Plex Mono',monospace; color:var(--text);}
tr:hover td{background:rgba(255,255,255,0.02);}
td.name{font-family:'Inter',sans-serif; font-weight:500;}
.tag-dot{display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:7px;}

.pill{display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:99px; font-size:11px; font-weight:600;}
.pill.pos{background:rgba(79,157,105,0.15); color:var(--green);}
.pill.neg{background:rgba(193,68,58,0.15); color:var(--red);}
.pill.neu{background:rgba(141,150,172,0.15); color:var(--text-dim);}

.alert-card{display:flex; gap:14px; padding:16px 18px; border-radius:10px; margin-bottom:12px; border:1px solid var(--border); background:var(--surface-2); border-left:3px solid var(--text-dimmer);}
.alert-card.sev-high{border-left-color:var(--red);}
.alert-card.sev-med{border-left-color:var(--gold);}
.alert-card.sev-low{border-left-color:var(--green);}
.alert-icon{width:34px; height:34px; border-radius:8px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:16px; background:rgba(255,255,255,0.04);}
.alert-card.sev-high .alert-icon{color:var(--red);}
.alert-card.sev-med .alert-icon{color:var(--gold-light);}
.alert-card.sev-low .alert-icon{color:var(--green);}
.alert-body .alert-title{font-size:13.5px; font-weight:600; margin-bottom:3px;}
.alert-body .alert-desc{font-size:12.5px; color:var(--text-dim); line-height:1.5;}
.alert-empty{text-align:center; padding:40px 20px; color:var(--text-dim); font-size:13px;}

.legend-row{display:flex; gap:16px; flex-wrap:wrap; margin-top:10px;}
.legend-item{display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-dim);}
.legend-item .sw{width:10px; height:10px; border-radius:3px;}

.empty-note{font-size:12px; color:var(--text-dimmer); font-style:italic; padding:10px 0;}
.readonly-banner{
  border-left:3px solid var(--gold); background:linear-gradient(90deg, rgba(199,163,57,0.08), var(--surface));
  font-size:12.5px; color:var(--text-dim); line-height:1.6; padding:16px 20px; border-radius:12px; margin-bottom:20px;
  border:1px solid var(--border);
}
.readonly-banner b{color:var(--gold-light);}

.login-shell{min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px;}
.login-card{width:100%; max-width:360px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:32px 28px;}
.login-card label{display:block; font-size:11.5px; color:var(--text-dimmer); margin-bottom:6px; margin-top:16px;}
.login-card input{width:100%;}
.login-error{color:var(--red); font-size:12.5px; margin-top:14px;}
'@)

[System.IO.File]::WriteAllText("$PWD\src\contexts\ThemeContext.jsx", @'
'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'joyerias-panel-theme';

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial = 'dark';
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        initial = saved;
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        initial = 'light';
      }
    } catch (e) { /* localStorage no disponible: usamos oscuro por defecto */ }
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
    setReady(true);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* no pasa nada si falla */ }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
}
'@)

[System.IO.File]::WriteAllText("$PWD\src\app\layout.jsx", @'
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';

export const metadata = {
  title: 'Joyerías del Cesar · Panel de control',
  description: 'Panel de control interno — datos financieros, publicidad y pendientes',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
'@)

[System.IO.File]::WriteAllText("$PWD\src\app\login\page.jsx", @'
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/');
    } catch (err) {
      setError('Correo o contraseña incorrectos.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        style={{
          position: 'fixed', top: 20, right: 20,
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
          width: 34, height: 34, cursor: 'pointer', color: 'var(--text-dim)', fontSize: 16,
        }}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <div className="login-card">
        <div className="brand" style={{ marginBottom: 20 }}>
          <div className="mark">Joyerías del Cesar</div>
          <div className="sub">Panel de control</div>
        </div>
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Correo</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="login-error">{error}</div>}
          <button className="btn" type="submit" disabled={submitting} style={{ width: '100%', marginTop: 22 }}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
        <div style={{ fontSize: 11.5, color: 'var(--text-dimmer)', marginTop: 18, lineHeight: 1.5 }}>
          Tu cuenta la crea un administrador desde "Usuarios" — no hay registro abierto.
        </div>
      </div>
    </div>
  );
}
'@)

Write-Host "Listo: todos los archivos fueron reemplazados." -ForegroundColor Green

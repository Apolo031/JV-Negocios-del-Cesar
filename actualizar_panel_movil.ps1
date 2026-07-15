$utf8NoBom = New-Object System.Text.UTF8Encoding $false

# --- escribir archivos (UTF-8 sin BOM) ---
$content = @'
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

.shell{display:flex; min-height:100vh; position:relative;}

.mobile-topbar{
  display:none;
  position:sticky; top:0; z-index:30;
  align-items:center; gap:12px;
  padding:12px 16px;
  background:var(--surface); border-bottom:1px solid var(--border);
}
.mobile-topbar .mark{font-family:'Fraunces', serif; font-weight:700; font-size:16px; color:var(--gold-light);}
.hamburger-btn{
  background:var(--surface-2); border:1px solid var(--border); border-radius:8px;
  width:36px; height:36px; flex-shrink:0; cursor:pointer; color:var(--text);
  display:flex; align-items:center; justify-content:center; font-size:18px;
}
.sidebar-backdrop{display:none;}

.sidebar{
  width:230px; flex-shrink:0;
  background:linear-gradient(180deg, #171c25, #12151c);
  border-right:1px solid var(--border);
  padding:26px 18px;
  display:flex; flex-direction:column; gap:6px;
  position:sticky; top:0; height:100vh;
  overflow-y:auto;
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

.main{flex:1; min-width:0; padding:28px 34px 60px; overflow-x:hidden;}
.topbar{display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:26px; flex-wrap:wrap;}
.topbar h1{font-family:'Fraunces', serif; font-weight:600; font-size:26px;}
.topbar p{color:var(--text-dim); font-size:13.5px; margin-top:5px;}
.topbar select, .topbar .btn-group, .topbar input{max-width:100%;}

.kpi-row{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:22px;}
.kpi{background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px 18px 16px; position:relative; overflow:hidden;}
.kpi::before{content:""; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg, var(--gold), transparent);}
.kpi .label{font-size:11.5px; color:var(--text-dim); text-transform:uppercase; letter-spacing:.05em; margin-bottom:10px;}
.kpi .value{font-family:'IBM Plex Mono',monospace; font-size:23px; font-weight:600; color:var(--text); word-break:break-word;}
.kpi .delta{font-size:12px; margin-top:8px; display:flex; align-items:center; gap:4px;}
.delta.up{color:var(--green);} .delta.down{color:var(--red);}

.panel{background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px 22px; margin-bottom:20px; min-width:0;}
.panel-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:12px; flex-wrap:wrap;}
.panel-head h3{font-size:14.5px; font-weight:600; color:var(--text);}
.panel-head .hint{font-size:11.5px; color:var(--text-dimmer);}

.grid-2{display:grid; grid-template-columns:1.3fr 1fr; gap:20px;}
@media (max-width:1080px){.grid-2{grid-template-columns:1fr;} .kpi-row{grid-template-columns:repeat(2,1fr);}}

/* ---- Formularios de varias columnas (registro de publicidad, crear usuario) ---- */
.form-grid{display:grid; grid-template-columns:repeat(6,1fr); gap:10px; align-items:end;}
.form-grid.cols-5{grid-template-columns:repeat(5,1fr);}
.form-grid .fg-span2{grid-column:span 2;}
.form-grid .fg-span5{grid-column:span 5;}

/* ============================================================
   RESPONSIVE — tablets y celulares
   ============================================================ */
.sidebar-close-btn{display:none;}

@media (max-width:900px){
  .mobile-topbar{display:flex;}
  .sidebar-close-btn{display:flex;}
  .sidebar-backdrop{
    display:block; position:fixed; inset:0; background:rgba(0,0,0,0.5);
    z-index:39; opacity:0; pointer-events:none; transition:opacity .2s ease;
  }
  .sidebar-backdrop.open{opacity:1; pointer-events:auto;}
  .sidebar{
    position:fixed; top:0; left:0; height:100vh; z-index:40;
    transform:translateX(-100%); transition:transform .2s ease;
    width:260px; max-width:82vw;
    box-shadow:2px 0 24px rgba(0,0,0,0.35);
  }
  .sidebar.open{transform:translateX(0);}
  .main{padding:18px 16px 48px;}
  .topbar h1{font-size:21px;}
  .topbar{margin-bottom:18px;}
  .kpi-row{grid-template-columns:repeat(2,1fr); gap:10px;}
  .panel{padding:16px 14px;}
  .ingot-name{width:72px; font-size:11.5px;}
  .ingot-value{width:96px; font-size:11px;}
  .form-grid, .form-grid.cols-5{grid-template-columns:repeat(2,1fr);}
  .form-grid .fg-span2, .form-grid .fg-span5{grid-column:span 2;}
}

@media (max-width:520px){
  .kpi-row{grid-template-columns:1fr;}
  .topbar h1{font-size:19px;}
  .panel-head h3{font-size:13.5px;}
  .ingot-rank{display:none;}
  .form-grid, .form-grid.cols-5{grid-template-columns:1fr;}
  .form-grid .fg-span2, .form-grid .fg-span5{grid-column:span 1;}
  table{font-size:11.5px;}
  th, td{padding:6px 7px;}
}

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
'@
[System.IO.File]::WriteAllText("$PWD\src\app\globals.css", $content, $utf8NoBom)

$content = @'
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DataProvider } from '@/contexts/DataContext';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // cierra el menú deslizable al cambiar de página en móvil
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (loading || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
        Cargando…
      </div>
    );
  }

  return (
    <DataProvider>
      <div className="shell">
        <div className="mobile-topbar">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">☰</button>
          <div className="mark">Joyerías del Cesar</div>
        </div>
        <div className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
        <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} onClose={() => setSidebarOpen(false)} />
        <div className="main">{children}</div>
      </div>
    </DataProvider>
  );
}
'@
[System.IO.File]::WriteAllText("$PWD\src\app\(dashboard)\layout.jsx", $content, $utf8NoBom)

$content = @'
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

export default function Sidebar({ open, onNavigate, onClose }) {
  const pathname = usePathname();
  const { user, isAdmin, role, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className={`sidebar${open ? ' open' : ''}`}>
      <div className="brand" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div className="mark">Joyerías del Cesar</div>
          <div className="sub">Panel de control</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
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
          {onClose && (
            <button
              onClick={onClose}
              className="sidebar-close-btn"
              aria-label="Cerrar menú"
              style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
                width: 30, height: 30, flexShrink: 0, cursor: 'pointer', color: 'var(--text-dim)',
                alignItems: 'center', justifyContent: 'center', fontSize: 15,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {ITEMS.map((item) => {
        if (item.adminOnly && !isAdmin) return null;
        const active = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`} onClick={onNavigate}>
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
'@
[System.IO.File]::WriteAllText("$PWD\src\components\Sidebar.jsx", $content, $utf8NoBom)

$content = @'
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
          <form onSubmit={handleAddPub} className="form-grid">
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
            <div className="fg-span2">
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Descripción</div>
              <input type="text" placeholder="Ej: promo de julio" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div className="fg-span5">
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
'@
[System.IO.File]::WriteAllText("$PWD\src\app\(dashboard)\publicidad\page.jsx", $content, $utf8NoBom)

$content = @'
'use client';

import { useCallback, useEffect, useState } from 'react';
import RequireAdmin from '@/components/RequireAdmin';
import { useAuth } from '@/contexts/AuthContext';

function UsuariosInner() {
  const { getIdToken, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: 'operaciones' });
  const [creating, setCreating] = useState(false);

  const authedFetch = useCallback(async (url, options = {}) => {
    const token = await getIdToken();
    const res = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error de servidor');
    return data;
  }, [getIdToken]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authedFetch('/api/users');
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await authedFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setForm({ email: '', password: '', displayName: '', role: 'operaciones' });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(uid, role) {
    try {
      await authedFetch(`/api/users/${uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleDisabled(uid, disabled) {
    try {
      await authedFetch(`/api/users/${uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
      });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(uid) {
    if (!confirm('¿Eliminar esta cuenta? No se puede deshacer.')) return;
    try {
      await authedFetch(`/api/users/${uid}`, { method: 'DELETE' });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Usuarios</h1><p>Crea cuentas y asigna el rol de administrador u operaciones</p></div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Nuevo usuario</h3></div>
        <form onSubmit={handleCreate} className="form-grid cols-5">
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Correo</div>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Contraseña</div>
            <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Nombre</div>
            <input type="text" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} style={{ width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Rol</div>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ width: '100%' }}>
              <option value="operaciones">Operaciones (solo lectura)</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <button className="btn" type="submit" disabled={creating}>{creating ? 'Creando…' : '+ Crear usuario'}</button>
        </form>
        {error && <div className="login-error">{error}</div>}
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Usuarios existentes</h3></div>
        {loading ? (
          <div className="empty-note">Cargando…</div>
        ) : (
          <table>
            <thead><tr><th style={{ textAlign: 'left' }}>Correo</th><th style={{ textAlign: 'left' }}>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.uid}>
                  <td className="name">{u.email}</td>
                  <td className="name">{u.displayName || '—'}</td>
                  <td>
                    <select value={u.role} onChange={(e) => handleRoleChange(u.uid, e.target.value)} disabled={u.uid === user.uid}>
                      <option value="operaciones">Operaciones</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </td>
                  <td>
                    <span className={`pill ${u.disabled ? 'neg' : 'pos'}`}>{u.disabled ? 'Deshabilitado' : 'Activo'}</span>
                  </td>
                  <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-outline" onClick={() => handleToggleDisabled(u.uid, !u.disabled)}>
                      {u.disabled ? 'Habilitar' : 'Deshabilitar'}
                    </button>
                    {u.uid !== user.uid && (
                      <button className="btn-outline" onClick={() => handleDelete(u.uid)}>Eliminar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  return (
    <RequireAdmin>
      <UsuariosInner />
    </RequireAdmin>
  );
}
'@
[System.IO.File]::WriteAllText("$PWD\src\app\(dashboard)\admin\usuarios\page.jsx", $content, $utf8NoBom)

$content = @'
'use client';

import { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import ChartCanvas from '@/components/charts/ChartCanvas';
import {
  BRANCHES, BRANCH_COLOR, METRIC_LABEL, MONTH_NAMES, MONTH_NAMES_FULL,
  fmtByMetric, fmtMoney, fmtMoneyShort, fmtGr, isMoney,
  series, totalFor, lastActiveMonth2026,
} from '@/lib/dataHelpers';

const CHART_METRICS = ['utilidad', 'valor_contratado', 'gr_contrato', 'prorroga', 'valor_venta_oro', 'valor_venta_plata'];

export default function DetallePage() {
  const { monthly, loading } = useData();
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [year, setYear] = useState('2026');
  const [metric, setMetric] = useState('utilidad');

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Cargando…</div>;

  const lastM = lastActiveMonth2026(monthly);
  const cutoff = year === '2026' ? lastM + 1 : 12;

  const totUt = totalFor(monthly, branch, year, 'utilidad', cutoff);
  const totVc = totalFor(monthly, branch, year, 'valor_contratado', cutoff);
  const totGr = totalFor(monthly, branch, year, 'gr_contrato', cutoff);
  const margen = totVc ? (totUt / totVc) * 100 : 0;

  const raw = series(monthly, branch, year, metric);
  const chartData = raw.map((v, i) => (year === '2026' && i > lastM ? null : v));

  const chEfecty = totalFor(monthly, branch, year, 'operacion_efecty', cutoff);
  const chSiste = totalFor(monthly, branch, year, 'operacion_sistecredito', cutoff);
  const chOro = totalFor(monthly, branch, year, 'valor_venta_oro', cutoff);
  const chPlata = totalFor(monthly, branch, year, 'valor_venta_plata', cutoff);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Detalle por sucursal</h1>
          <p>Composición mensual completa de una joyería</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={branch} onChange={(e) => setBranch(e.target.value)}>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select>
          <select value={year} onChange={(e) => setYear(e.target.value)}><option value="2026">2026</option><option value="2025">2025</option></select>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><div className="label">Valor contratado</div><div className="value">{fmtMoney(totVc)}</div></div>
        <div className="kpi"><div className="label">Utilidad</div><div className="value">{fmtMoney(totUt)}</div></div>
        <div className="kpi"><div className="label">Margen</div><div className="value">{margen.toFixed(1)}%</div></div>
        <div className="kpi"><div className="label">Gramos en contrato</div><div className="value">{fmtGr(totGr)}</div></div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>Evolución mensual</h3>
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {CHART_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
            </select>
          </div>
          <ChartCanvas
            height={220}
            config={{
              type: 'bar',
              data: { labels: MONTH_NAMES, datasets: [{ label: METRIC_LABEL[metric], data: chartData, backgroundColor: BRANCH_COLOR[branch], borderRadius: 5 }] },
              options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtByMetric(metric, c.raw) } } }, scales: { y: { ticks: { callback: (v) => (isMoney(metric) ? fmtMoneyShort(v) : v) } } } },
            }}
          />
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Canales de recaudo</h3></div>
          <ChartCanvas
            height={220}
            config={{
              type: 'doughnut',
              data: { labels: ['Recaudo Efecty', 'Recaudo Sistecrédito', 'Venta de oro', 'Venta de plata'], datasets: [{ data: [chEfecty, chSiste, chOro, chPlata], backgroundColor: ['#5b8dbe', '#7fa37a', '#e8cd7a', '#9b7ebd'], borderColor: '#1a2029', borderWidth: 2 }] },
              options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => c.label + ': ' + fmtMoney(c.raw) } } } },
            }}
          />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Tabla mensual completa</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th style={{ textAlign: 'left' }}>Mes</th><th>Gramos</th><th>Valor contratado</th><th>Utilidad</th><th>Prórroga</th><th>Venta oro (g)</th><th>Venta oro ($)</th><th>Efecty</th><th>Sistecrédito</th></tr></thead>
            <tbody>
              {Array.from({ length: year === '2026' ? lastM + 1 : 12 }).map((_, m) => (
                <tr key={m}>
                  <td className="name">{MONTH_NAMES_FULL[m]}</td>
                  <td>{fmtGr(series(monthly, branch, year, 'gr_contrato')[m])}</td>
                  <td>{fmtMoney(series(monthly, branch, year, 'valor_contratado')[m])}</td>
                  <td>{fmtMoney(series(monthly, branch, year, 'utilidad')[m])}</td>
                  <td>{fmtMoney(series(monthly, branch, year, 'prorroga')[m])}</td>
                  <td>{fmtGr(series(monthly, branch, year, 'venta_oro')[m])}</td>
                  <td>{fmtMoney(series(monthly, branch, year, 'valor_venta_oro')[m])}</td>
                  <td>{fmtMoney(series(monthly, branch, year, 'operacion_efecty')[m])}</td>
                  <td>{fmtMoney(series(monthly, branch, year, 'operacion_sistecredito')[m])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
'@
[System.IO.File]::WriteAllText("$PWD\src\app\(dashboard)\detalle\page.jsx", $content, $utf8NoBom)

$content = @'
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
'@
[System.IO.File]::WriteAllText("$PWD\src\app\(dashboard)\editar\page.jsx", $content, $utf8NoBom)

Write-Host "Listo: panel ajustado para movil y escritorio." -ForegroundColor Green

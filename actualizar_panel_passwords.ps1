$utf8NoBom = New-Object System.Text.UTF8Encoding $false

New-Item -ItemType Directory -Force -Path "src\app\api\users\[uid]\set-password" | Out-Null
New-Item -ItemType Directory -Force -Path "src\app\(dashboard)\cuenta" | Out-Null

$content = @'
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const DEFAULT_PASSWORD = 'Bienvenido123';

// GET /api/users — lista todos los usuarios (solo admin)
export async function GET(request) {
  try {
    await requireAdmin(request);
    const list = await adminAuth.listUsers(1000);
    const users = list.users.map((u) => ({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName || '',
      role: u.customClaims?.role || 'operaciones',
      disabled: u.disabled,
      createdAt: u.metadata.creationTime,
    }));
    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error' }, { status: err.status || 500 });
  }
}

// POST /api/users — crea un usuario nuevo con rol y una contraseña inicial
// fija (solo admin). El admin le comparte esa contraseña a la persona por
// fuera (WhatsApp, en persona, etc.) y ella la cambia luego en "Mi cuenta".
// body: { email, displayName, role: 'admin' | 'operaciones' }
export async function POST(request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const { email, displayName, role } = body;

    if (!email) {
      return NextResponse.json({ error: 'El correo es obligatorio.' }, { status: 400 });
    }
    const finalRole = role === 'admin' ? 'admin' : 'operaciones';

    const userRecord = await adminAuth.createUser({ email, password: DEFAULT_PASSWORD, displayName: displayName || '' });
    await adminAuth.setCustomUserClaims(userRecord.uid, { role: finalRole });
    await adminDb.collection('users').doc(userRecord.uid).set({
      email, displayName: displayName || '', role: finalRole, createdAt: Date.now(),
    });

    return NextResponse.json({ uid: userRecord.uid, email, defaultPassword: DEFAULT_PASSWORD });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error' }, { status: err.status || 500 });
  }
}
'@
[System.IO.File]::WriteAllText("$PWD\src\app\api\users\route.js", $content, $utf8NoBom)

$content = @'
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

// POST /api/users/[uid]/set-password — el admin define directamente una
// contraseña nueva para cualquier usuario (por ejemplo, si la perdió).
// body: { password }
export async function POST(request, { params }) {
  try {
    await requireAdmin(request);
    const { uid } = params;
    const { password } = await request.json();

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
    }

    await adminAuth.updateUser(uid, { password });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al cambiar la contraseña' }, { status: err.status || 500 });
  }
}
'@
[System.IO.File]::WriteAllText("$PWD\src\app\api\users\[uid]\set-password\route.js", $content, $utf8NoBom)

$content = @'
'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import RequireAdmin from '@/components/RequireAdmin';
import { useAuth } from '@/contexts/AuthContext';

export default function UsuariosPage() {
  return (
    <RequireAdmin>
      <UsuariosInner />
    </RequireAdmin>
  );
}

function UsuariosInner() {
  const { getIdToken, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ email: '', displayName: '', role: 'operaciones' });
  const [creating, setCreating] = useState(false);

  // fila donde se está escribiendo una contraseña nueva (solo una a la vez)
  const [passwordUid, setPasswordUid] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

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
    setNotice('');
    setCreating(true);
    try {
      const data = await authedFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setNotice(`Usuario creado: ${data.email}. Contraseña inicial: "${data.defaultPassword}" — compártesela para que entre y la cambie en "Mi cuenta".`);
      setForm({ email: '', displayName: '', role: form.role });
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

  function startPasswordChange(uid) {
    setPasswordUid(uid);
    setPasswordValue('');
    setError('');
    setNotice('');
  }

  async function handleSavePassword(email) {
    if (passwordValue.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setSavingPassword(true);
    try {
      await authedFetch(`/api/users/${passwordUid}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordValue }),
      });
      setNotice(`Contraseña actualizada para ${email}. Comunícasela para que entre.`);
      setPasswordUid('');
      setPasswordValue('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Usuarios</h1><p>Crea cuentas, asigna roles, y restablece contraseñas si alguien la pierde</p></div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Nuevo usuario</h3></div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
          Se crea con una contraseña inicial fija (<code>Bienvenido123</code>). Compártesela a la
          persona por el medio que prefieras — al entrar puede cambiarla ella misma desde
          "Mi cuenta".
        </div>
        <form onSubmit={handleCreate} className="form-grid cols-5">
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Correo</div>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ width: '100%' }} />
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
        {notice && <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 10 }}>{notice}</div>}
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Usuarios existentes</h3></div>
        {loading ? (
          <div className="empty-note">Cargando…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th style={{ textAlign: 'left' }}>Correo</th><th style={{ textAlign: 'left' }}>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <Fragment key={u.uid}>
                    <tr>
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
                      <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn-outline" onClick={() => startPasswordChange(u.uid)}>
                          Cambiar contraseña
                        </button>
                        <button className="btn-outline" onClick={() => handleToggleDisabled(u.uid, !u.disabled)}>
                          {u.disabled ? 'Habilitar' : 'Deshabilitar'}
                        </button>
                        {u.uid !== user.uid && (
                          <button className="btn-outline" onClick={() => handleDelete(u.uid)}>Eliminar</button>
                        )}
                      </td>
                    </tr>
                    {passwordUid === u.uid && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--surface-2)' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Nueva contraseña para {u.email}:</span>
                            <input
                              type="text"
                              value={passwordValue}
                              onChange={(e) => setPasswordValue(e.target.value)}
                              placeholder="mín. 8 caracteres"
                              style={{ width: 200 }}
                            />
                            <button className="btn" onClick={() => handleSavePassword(u.email)} disabled={savingPassword}>
                              {savingPassword ? 'Guardando…' : 'Guardar'}
                            </button>
                            <button className="btn-outline" onClick={() => setPasswordUid('')}>Cancelar</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
'@
[System.IO.File]::WriteAllText("$PWD\src\app\(dashboard)\admin\usuarios\page.jsx", $content, $utf8NoBom)

$content = @'
'use client';

import { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';

export default function CuentaPage() {
  const { user, role } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');

    if (newPassword.length < 8) {
      setError('La contraseña nueva debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide con la contraseña nueva.');
      return;
    }

    setSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setNotice('Tu contraseña se actualizó correctamente.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('La contraseña actual no es correcta.');
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div><h1>Mi cuenta</h1><p>Cambia tu propia contraseña</p></div>
      </div>

      <div className="panel" style={{ maxWidth: 420 }}>
        <div className="panel-head"><h3>Datos de la cuenta</h3></div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.8 }}>
          <div>Correo: <b style={{ color: 'var(--text)' }}>{user?.email}</b></div>
          <div>Rol: <b style={{ color: 'var(--text)' }}>{role === 'admin' ? 'Administrador' : 'Operaciones (solo lectura)'}</b></div>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 420 }}>
        <div className="panel-head"><h3>Cambiar contraseña</h3></div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Contraseña actual</div>
            <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Contraseña nueva (mín. 8 caracteres)</div>
            <input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Confirmar contraseña nueva</div>
            <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ width: '100%' }} />
          </div>
          {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}
          {notice && <div style={{ fontSize: 12.5, color: 'var(--green)', marginBottom: 12 }}>{notice}</div>}
          <button className="btn" type="submit" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Guardando…' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
'@
[System.IO.File]::WriteAllText("$PWD\src\app\(dashboard)\cuenta\page.jsx", $content, $utf8NoBom)

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
  { href: '/cuenta', label: 'Mi cuenta' },
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

Write-Host "Listo: contrasena inicial y Mi cuenta activados. Recuerda borrar la carpeta reset-link si aun existe." -ForegroundColor Green

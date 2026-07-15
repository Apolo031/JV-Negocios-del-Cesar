$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$content = @'
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

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

// POST /api/users — crea un usuario nuevo con rol, SIN contraseña (solo admin).
// El usuario recibe un correo para crear su propia contraseña la primera vez.
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

    // Se crea SIN password: el usuario la define él mismo con el enlace que le llega por correo.
    const userRecord = await adminAuth.createUser({ email, displayName: displayName || '' });
    await adminAuth.setCustomUserClaims(userRecord.uid, { role: finalRole });
    await adminDb.collection('users').doc(userRecord.uid).set({
      email, displayName: displayName || '', role: finalRole, createdAt: Date.now(),
    });

    return NextResponse.json({ uid: userRecord.uid, email });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error' }, { status: err.status || 500 });
  }
}
'@
[System.IO.File]::WriteAllText("$PWD\src\app\api\users\route.js", $content, $utf8NoBom)

$content = @'
'use client';

import { useCallback, useEffect, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import RequireAdmin from '@/components/RequireAdmin';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebaseClient';

function UsuariosInner() {
  const { getIdToken, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ email: '', displayName: '', role: 'operaciones' });
  const [creating, setCreating] = useState(false);
  const [resendingUid, setResendingUid] = useState('');

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
      // Firebase manda automáticamente un correo con un enlace para que el
      // usuario cree su propia contraseña (no necesitamos servidor de correo propio).
      await sendPasswordResetEmail(auth, data.email);
      setNotice(`Usuario creado. Le llegó un correo a ${data.email} para que cree su contraseña.`);
      setForm({ email: '', displayName: '', role: form.role });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleResendInvite(email, uid) {
    setError('');
    setNotice('');
    setResendingUid(uid);
    try {
      await sendPasswordResetEmail(auth, email);
      setNotice(`Se reenvió el correo de invitación a ${email}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setResendingUid('');
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
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
          No defines la contraseña tú — en cuanto crees la cuenta, le va a llegar un correo a esa
          dirección para que la persona cree su propia contraseña.
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
          <button className="btn" type="submit" disabled={creating}>{creating ? 'Creando…' : '+ Crear usuario e invitar'}</button>
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
                    <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button className="btn-outline" onClick={() => handleResendInvite(u.email, u.uid)} disabled={resendingUid === u.uid}>
                        {resendingUid === u.uid ? 'Enviando…' : 'Reenviar invitación'}
                      </button>
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
          </div>
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

Write-Host "Listo: invitacion por correo activada." -ForegroundColor Green

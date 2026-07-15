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
        <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, alignItems: 'end' }}>
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

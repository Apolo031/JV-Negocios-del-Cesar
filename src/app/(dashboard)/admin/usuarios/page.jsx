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
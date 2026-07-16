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
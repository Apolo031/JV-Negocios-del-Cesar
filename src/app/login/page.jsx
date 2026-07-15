'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
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

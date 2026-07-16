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
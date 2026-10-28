'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

const SECTIONS = [
  {
    title: 'Dashboard y gestión general',
    items: [
      { href: '/', label: 'Resumen general', icon: '📊' },
      { href: '/seguimiento-semanal', label: 'Seguimiento semanal', icon: '📈' },
      { href: '/alertas', label: 'Alertas', icon: '🔔' },
    ],
  },
  {
    title: 'Operaciones y comercial',
    items: [
      { href: '/contratos', label: 'Contratos', icon: '📜' },
      { href: '/facturas', label: 'Facturas (R+R)', icon: '🧾' },
      { href: '/inventario', label: 'Inventario', icon: '💎' },
      { href: '/reparaciones', label: 'Reparaciones', icon: '🔧' },
      { href: '/identificar-joya', label: 'Identificar joya', icon: '🔍' },
      { href: '/publicidad', label: 'Publicidad y pendientes', icon: '📣' },
    ],
  },
  {
    title: 'Inteligencia y análisis',
    items: [
      { href: '/analisis', label: 'Análisis con IA', icon: '🤖' },
    ],
  },
  {
    title: 'Administración y configuración',
    items: [
      { href: '/admin/usuarios', label: 'Usuarios', icon: '👥', adminOnly: true },
      { href: '/editar', label: 'Editar datos', icon: '⚙️', adminOnly: true },
      { href: '/cuenta', label: 'Mi cuenta', icon: '👤' },
    ],
  },
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

      {SECTIONS.map((section) => {
        const visibles = section.items.filter((item) => !item.adminOnly || isAdmin);
        if (visibles.length === 0) return null;
        return (
          <div className="nav-section" key={section.title}>
            <div className="nav-section-title">{section.title}</div>
            {visibles.map((item) => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className={`nav-item${active ? ' active' : ''}`} onClick={onNavigate}>
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}

      <div className="sidebar-foot">
        <div>Sesión: <b>{user?.email}</b></div>
        <div style={{ marginTop: 4 }}>Rol: <b>{role === 'admin' ? 'Administrador' : role === 'colaborador' ? 'Colaborador' : 'Operaciones (solo lectura)'}</b></div>
        <button className="btn-outline" style={{ marginTop: 10, width: '100%' }} onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
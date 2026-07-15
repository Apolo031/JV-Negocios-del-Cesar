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
  { href: '/analisis', label: 'AnÃ¡lisis con IA' },
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
          <div className="mark">JoyerÃ­as del Cesar</div>
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
          {theme === 'dark' ? 'â˜€ï¸' : 'ðŸŒ™'}
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
        <div>SesiÃ³n: <b>{user?.email}</b></div>
        <div style={{ marginTop: 4 }}>Rol: <b>{role === 'admin' ? 'Administrador' : 'Operaciones (solo lectura)'}</b></div>
        <button className="btn-outline" style={{ marginTop: 10, width: '100%' }} onClick={logout}>
          Cerrar sesiÃ³n
        </button>
      </div>
    </div>
  );
}
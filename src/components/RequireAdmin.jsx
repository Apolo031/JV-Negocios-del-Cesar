'use client';

import { useAuth } from '@/contexts/AuthContext';

/**
 * Oculta el contenido si el usuario no es admin. Esto es solo para la
 * experiencia de usuario — la protección real de los datos vive en
 * firestore.rules, que rechaza cualquier escritura de quien no tenga el
 * custom claim role == 'admin', sin importar lo que muestre la pantalla.
 */
export default function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <div className="panel" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px 20px' }}>
        Esta sección es solo para administradores. Tu rol actual es de solo lectura.
      </div>
    );
  }
  return children;
}

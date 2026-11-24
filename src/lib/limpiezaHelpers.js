// Constantes y helpers compartidos del módulo "Limpieza gratis" — tanto por
// la página pública de registro (sin sesión) como por el panel interno de
// Reparaciones. Sin imports de Firebase: seguro de usar en cliente o servidor.

export const CATEGORIAS_JOYA = ['Anillo', 'Cadena', 'Pulsera', 'Aretes', 'Dije', 'Reloj', 'Otro'];
export const METALES_JOYA = ['Oro', 'Plata', 'Otro'];
export const KILATAJES_ORO = ['8K', '10K', '14K', '18K', '21K', '24K'];

export const ESTADOS_LIMPIEZA = ['pendiente', 'atendida', 'no_realizada'];
export const ESTADO_LIMPIEZA_LABEL = { pendiente: 'Pendiente', atendida: 'Atendida', no_realizada: 'No realizada' };

// Días que el código sigue siendo válido para reclamar la limpieza antes de
// considerarse vencido (si sigue "pendiente" y ya pasó esta fecha).
export const DIAS_VALIDEZ_LIMPIEZA = 30;

function hexAleatorio(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s.toUpperCase();
}

/** Código tipo "LIM-1A70-1F2D" — corto para digitar a mano, único por intento (no garantizado, se revisa contra la base al crear). */
export function generarCodigoLimpieza() {
  return `LIM-${hexAleatorio(4)}-${hexAleatorio(4)}`;
}

export function normalizarCodigo(s) {
  return (s || '').trim().toUpperCase().replace(/\s+/g, '-');
}

/** Vencida = sigue pendiente y ya pasó la fecha límite de validez. */
export function estaVencidaLimpieza(limpieza) {
  if (!limpieza || limpieza.estado !== 'pendiente' || !limpieza.fechaLimite) return false;
  return limpieza.fechaLimite < new Date().toISOString().slice(0, 10);
}

/** Estado "efectivo" para mostrar/contar — igual al guardado, salvo que ya venció. */
export function estadoEfectivoLimpieza(limpieza) {
  if (estaVencidaLimpieza(limpieza)) return 'vencida';
  return limpieza.estado;
}

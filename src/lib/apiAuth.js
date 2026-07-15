import { adminAuth } from './firebaseAdmin';

/**
 * Verifica el ID token de Firebase que el cliente manda en el header
 * "Authorization: Bearer <token>". Lanza un objeto {status, message} si algo
 * falla, para que la API route lo capture y responda con el código correcto.
 *
 * Devuelve el token decodificado (incluye uid, email y el custom claim role).
 */
export async function requireAuth(request) {
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    throw { status: 401, message: 'Falta el token de autenticación.' };
  }
  try {
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded;
  } catch (err) {
    throw { status: 401, message: 'Token inválido o expirado.' };
  }
}

/** Igual que requireAuth, pero además exige que el rol sea "admin". */
export async function requireAdmin(request) {
  const decoded = await requireAuth(request);
  if (decoded.role !== 'admin') {
    throw { status: 403, message: 'Esta acción requiere el rol de administrador.' };
  }
  return decoded;
}

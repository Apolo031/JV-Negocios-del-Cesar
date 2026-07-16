import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

export const DEFAULT_PASSWORD = 'Bienvenido123';

// GET /api/users — lista todos los usuarios (solo admin)
export async function GET(request) {
  try {
    await requireAdmin(request);
    const list = await adminAuth.listUsers(1000);
    const users = list.users.map((u) => ({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName || '',
      role: u.customClaims?.role || 'operaciones',
      disabled: u.disabled,
      createdAt: u.metadata.creationTime,
    }));
    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error' }, { status: err.status || 500 });
  }
}

// POST /api/users — crea un usuario nuevo con rol y una contraseña inicial
// fija (solo admin). El admin le comparte esa contraseña a la persona por
// fuera (WhatsApp, en persona, etc.) y ella la cambia luego en "Mi cuenta".
// body: { email, displayName, role: 'admin' | 'operaciones' }
export async function POST(request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const { email, displayName, role } = body;

    if (!email) {
      return NextResponse.json({ error: 'El correo es obligatorio.' }, { status: 400 });
    }
    const finalRole = role === 'admin' ? 'admin' : 'operaciones';

    const userRecord = await adminAuth.createUser({ email, password: DEFAULT_PASSWORD, displayName: displayName || '' });
    await adminAuth.setCustomUserClaims(userRecord.uid, { role: finalRole });
    await adminDb.collection('users').doc(userRecord.uid).set({
      email, displayName: displayName || '', role: finalRole, createdAt: Date.now(),
    });

    return NextResponse.json({ uid: userRecord.uid, email, defaultPassword: DEFAULT_PASSWORD });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error' }, { status: err.status || 500 });
  }
}
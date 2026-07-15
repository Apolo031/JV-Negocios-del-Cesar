import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

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

// POST /api/users — crea un usuario nuevo con rol, SIN contraseña (solo admin).
// El usuario recibe un correo para crear su propia contraseña la primera vez.
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

    // Se crea SIN password: el usuario la define él mismo con el enlace que le llega por correo.
    const userRecord = await adminAuth.createUser({ email, displayName: displayName || '' });
    await adminAuth.setCustomUserClaims(userRecord.uid, { role: finalRole });
    await adminDb.collection('users').doc(userRecord.uid).set({
      email, displayName: displayName || '', role: finalRole, createdAt: Date.now(),
    });

    return NextResponse.json({ uid: userRecord.uid, email });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error' }, { status: err.status || 500 });
  }
}
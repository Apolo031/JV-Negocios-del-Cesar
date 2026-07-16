import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

// POST /api/users/[uid]/set-password — el admin define directamente una
// contraseña nueva para cualquier usuario (por ejemplo, si la perdió).
// body: { password }
export async function POST(request, { params }) {
  try {
    await requireAdmin(request);
    const { uid } = params;
    const { password } = await request.json();

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
    }

    await adminAuth.updateUser(uid, { password });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al cambiar la contraseña' }, { status: err.status || 500 });
  }
}
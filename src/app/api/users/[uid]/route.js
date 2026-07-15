import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';

// PATCH /api/users/[uid] — cambia rol y/o estado (activo/deshabilitado). Solo admin.
// body: { role?: 'admin'|'operaciones', disabled?: boolean }
export async function PATCH(request, { params }) {
  try {
    const decoded = await requireAdmin(request);
    const { uid } = params;
    const body = await request.json();

    if (uid === decoded.uid && body.role && body.role !== 'admin') {
      return NextResponse.json({ error: 'No puedes quitarte tu propio rol de administrador.' }, { status: 400 });
    }

    const updates = {};
    if (typeof body.disabled === 'boolean') updates.disabled = body.disabled;
    if (Object.keys(updates).length) await adminAuth.updateUser(uid, updates);

    if (body.role) {
      const finalRole = body.role === 'admin' ? 'admin' : 'operaciones';
      await adminAuth.setCustomUserClaims(uid, { role: finalRole });
      await adminDb.collection('users').doc(uid).set({ role: finalRole }, { merge: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error' }, { status: err.status || 500 });
  }
}

// DELETE /api/users/[uid] — elimina un usuario. Solo admin, y no puede autoeliminarse.
export async function DELETE(request, { params }) {
  try {
    const decoded = await requireAdmin(request);
    const { uid } = params;
    if (uid === decoded.uid) {
      return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta desde aquí.' }, { status: 400 });
    }
    await adminAuth.deleteUser(uid);
    await adminDb.collection('users').doc(uid).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error' }, { status: err.status || 500 });
  }
}

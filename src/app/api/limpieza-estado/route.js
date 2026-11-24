import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalizarCodigo } from '@/lib/limpiezaHelpers';

export const runtime = 'nodejs';

// Ruta PÚBLICA (sin login): el cliente la consulta al escanear su QR o
// volver a entrar al link para ver en qué va su limpieza. Solo expone los
// campos propios de ese código — nunca una lista completa ni datos de otros
// clientes.
export async function GET(request) {
  try {
    const codigo = normalizarCodigo(new URL(request.url).searchParams.get('codigo'));
    if (!codigo) return NextResponse.json({ error: 'Falta el código.' }, { status: 400 });

    const snap = await adminDb.collection('limpiezas').where('codigo', '==', codigo).limit(1).get();
    if (snap.empty) return NextResponse.json({ error: 'No encontramos ese código.' }, { status: 404 });

    const d = snap.docs[0].data();
    return NextResponse.json({
      codigo: d.codigo, sucursal: d.sucursal, nombreCliente: d.nombreCliente, estado: d.estado,
      fechaRegistro: d.fechaRegistro, fechaLimite: d.fechaLimite,
      categoria: d.categoria, metal: d.metal, kilataje: d.kilataje, pesoGramos: d.pesoGramos,
      observacion: d.observacion, fotoUrl: d.fotoUrl, fechaAtencion: d.fechaAtencion,
      esClienteNuevo: d.esClienteNuevo,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'No se pudo consultar el código.' }, { status: 500 });
  }
}

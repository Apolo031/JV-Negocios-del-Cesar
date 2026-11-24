import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { BRANCHES } from '@/lib/dataHelpers';
import { DIAS_VALIDEZ_LIMPIEZA, generarCodigoLimpieza } from '@/lib/limpiezaHelpers';

export const runtime = 'nodejs';

// Ruta PÚBLICA (sin login): la landing page de "Limpieza gratis" la llama
// directo desde el celular del cliente, antes de que exista ninguna sesión.
// Por eso el registro se hace con el Admin SDK (nunca se abren las reglas de
// Firestore a escrituras anónimas) y solo se guardan los 3 datos que el
// cliente da aquí — todo lo demás (categoría, metal, foto...) lo llena el
// personal de la joyería cuando la persona se presenta físicamente.
export async function POST(request) {
  try {
    const body = await request.json();
    const nombreCliente = (body.nombreCliente || '').trim();
    const telefono = (body.telefono || '').trim();
    const sucursal = (body.sucursal || '').trim();

    if (!nombreCliente) return NextResponse.json({ error: 'Falta el nombre.' }, { status: 400 });
    if (!telefono || telefono.replace(/\D/g, '').length < 7) {
      return NextResponse.json({ error: 'El teléfono no parece válido.' }, { status: 400 });
    }
    if (!BRANCHES.includes(sucursal)) {
      return NextResponse.json({ error: 'Elige una sucursal de la lista.' }, { status: 400 });
    }

    // El código es aleatorio — en la práctica nunca choca, pero se revisa por
    // si acaso antes de guardar, en vez de confiar ciegamente en el azar.
    let codigo = generarCodigoLimpieza();
    for (let intento = 0; intento < 5; intento++) {
      const existente = await adminDb.collection('limpiezas').where('codigo', '==', codigo).limit(1).get();
      if (existente.empty) break;
      codigo = generarCodigoLimpieza();
    }

    const ahora = Date.now();
    const fechaLimite = new Date(ahora + DIAS_VALIDEZ_LIMPIEZA * 86400000).toISOString().slice(0, 10);

    await adminDb.collection('limpiezas').add({
      codigo, sucursal, nombreCliente, telefono,
      estado: 'pendiente', fechaRegistro: ahora, fechaLimite,
      esClienteNuevo: null, categoria: null, metal: null, kilataje: null,
      pesoGramos: null, observacion: null, fotoUrl: null,
      atendidoPor: null, fechaAtencion: null,
    });

    return NextResponse.json({ codigo, fechaLimite });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'No se pudo registrar la solicitud.' }, { status: 500 });
  }
}

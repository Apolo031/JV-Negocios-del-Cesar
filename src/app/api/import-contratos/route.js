import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseContratosBuffer, slugifyId } from '@/lib/contratosParser';

export const runtime = 'nodejs';

// POST /api/import-contratos — recibe un archivo .xlsx/.xls/.csv (multipart/form-data,
// campo "file") con el listado de contratos, y lo sube a Firestore (colección
// "contratos"), un documento por contrato (id = Contrato Secuencia). Solo admin.
export async function POST(request) {
  try {
    await requireAdmin(request);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contratos = parseContratosBuffer(buffer);

    if (contratos.length === 0) {
      return NextResponse.json({
        error: 'No se reconoció ningún contrato en el archivo (se esperaba la columna "Contrato Secuencia").',
      }, { status: 400 });
    }

    // Firestore permite máximo 500 operaciones por batch.
    const CHUNK = 450;
    let count = 0;
    for (let i = 0; i < contratos.length; i += CHUNK) {
      const slice = contratos.slice(i, i + CHUNK);
      const batch = adminDb.batch();
      for (const contrato of slice) {
        const docId = slugifyId(contrato.contratoSecuencia);
        batch.set(adminDb.collection('contratos').doc(docId), contrato);
        count++;
      }
      await batch.commit();
    }

    return NextResponse.json({ count });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al importar el archivo' }, { status: err.status || 500 });
  }
}

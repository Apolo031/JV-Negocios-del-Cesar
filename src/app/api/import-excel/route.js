import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseWorkbookBuffer, slugifyFecha } from '@/lib/excelParser';

export const runtime = 'nodejs';

// POST /api/import-excel â€” recibe un archivo .xlsx (multipart/form-data, campo "file"),
// extrae los datos mensuales y semanales, y los sobreescribe en Firestore. Solo admin.
export async function POST(request) {
  try {
    await requireAdmin(request);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ error: 'No se recibiÃ³ ningÃºn archivo.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { monthly, weekly } = parseWorkbookBuffer(buffer);

    const branches = Object.keys(monthly);
    if (branches.length === 0) {
      return NextResponse.json({
        error: 'No se reconociÃ³ ninguna hoja de sucursal (se esperaba BARRANQUILLA, CAUCASIA, EURO, HEROICA o SINU).',
      }, { status: 400 });
    }

    let monthlyCount = 0;
    for (const branch of branches) {
      for (const year of Object.keys(monthly[branch])) {
        const docId = `${branch}_${year}`;
        await adminDb.collection('monthly').doc(docId).set({
          branch, year, metrics: monthly[branch][year],
        });
        monthlyCount++;
      }
    }

    let weeklyCount = 0;
    for (const week of weekly) {
      const docId = slugifyFecha(week.fecha);
      await adminDb.collection('weekly').doc(docId).set(week);
      weeklyCount++;
    }

    return NextResponse.json({ branches, monthlyCount, weeklyCount });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al importar el archivo' }, { status: err.status || 500 });
  }
}
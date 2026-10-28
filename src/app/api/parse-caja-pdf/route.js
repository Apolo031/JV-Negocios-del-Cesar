import { NextResponse } from 'next/server';
import '@/lib/pdfPolyfills'; // debe ir antes del import de pdf-parse — ver ese archivo
import { PDFParse } from 'pdf-parse';
import { requireAdmin } from '@/lib/apiAuth';
import { parseCajaPdfText } from '@/lib/cajaPdfParser';

export const runtime = 'nodejs';

// POST /api/parse-caja-pdf — recibe un PDF de "Movimientos de Caja
// Consolidados" (mensual) o de "Cuadre de Caja" (diario) de una sucursal
// (multipart/form-data, campo "file") y devuelve los indicadores
// extraídos para revisarlos en "Editar datos". Un mismo PDF puede traer
// varios periodos seguidos (ej. un consolidado por cada mes del año), por
// eso siempre se devuelve una LISTA de resultados, uno por periodo
// encontrado. NO escribe nada en la base de datos — eso lo hace el
// cliente, desde la pantalla de revisión.
export async function POST(request) {
  let parser;
  try {
    await requireAdmin(request);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    const fullText = textResult.pages.map((p) => p.text).join('\n');

    const { resultados } = parseCajaPdfText(fullText);
    if (resultados.length === 0) {
      return NextResponse.json({
        error: 'No se reconoció el formato del PDF (se esperaba un "Cuadre de caja" o un "Movimientos de Caja Consolidados").',
      }, { status: 400 });
    }

    return NextResponse.json({ resultados });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al leer el PDF' }, { status: err.status || 500 });
  } finally {
    await parser?.destroy();
  }
}

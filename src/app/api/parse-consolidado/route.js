import { NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import { requireAdmin } from '@/lib/apiAuth';
import { parseConsolidadoText } from '@/lib/consolidadoParser';

export const runtime = 'nodejs';

// POST /api/parse-consolidado — recibe el PDF de "Movimientos de Caja
// Consolidados" (multipart/form-data, campo "file") y devuelve los
// indicadores extraídos para revisarlos. NO escribe nada en la base de
// datos — eso lo hace el cliente, desde la pantalla de revisión, igual que
// "Editar datos".
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

    const resultado = parseConsolidadoText(fullText);
    if (!resultado.codigoDetectado && resultado.valores.utilidad === 0 && resultado.valores.gr_contrato === 0) {
      return NextResponse.json({
        error: 'No se reconoció el formato del PDF (se esperaba un reporte "Movimientos de Caja Consolidados").',
      }, { status: 400 });
    }

    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al leer el PDF' }, { status: err.status || 500 });
  } finally {
    await parser?.destroy();
  }
}

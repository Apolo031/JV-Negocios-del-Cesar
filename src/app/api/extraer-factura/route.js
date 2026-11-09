import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;

/** Claude a veces envuelve el JSON en una fila de código aunque se le pida que no lo haga. */
function extractJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

const PROMPT = `Esta es una factura de un servicio público colombiano (energía, acueducto/alcantarillado, gas o un combinado como EPM). Extrae los datos y responde EXCLUSIVAMENTE en formato JSON (sin texto adicional, sin fila de código) con esta estructura exacta:
{
  "empresa": "Nombre de la empresa que emite la factura (ej. EPM, Air-e, Alcanos, Vanti, acueducto municipal)",
  "servicio": "Uno de: Energía, Acueducto, Gas, EPM, Agua y luz, Todas, Otro",
  "valor_total": número entero en pesos colombianos (el total a pagar, sin puntos ni comas ni símbolo $), o null si no aparece,
  "consumo": número (la cantidad consumida en el periodo, ej. kWh o m3), o null si no aparece o la factura combina varios servicios con consumos distintos,
  "unidad_consumo": "kWh", "m3" u otra unidad tal como aparece, o null,
  "periodo_facturado": texto tal como aparece el periodo de consumo o facturación (ej. "01/09/2026 a 30/09/2026"), o null,
  "fecha_vencimiento": fecha límite de pago en formato "YYYY-MM-DD", o null si no aparece,
  "numero_factura": número o código de factura/cuenta contrato, o null,
  "confianza": "Alta", "Media" o "Baja" según qué tan seguro estás de los valores extraídos
}
Si la factura trae varios periodos o cortes, usa el más reciente. Si algún dato no aparece o no se puede leer con claridad, usa null en vez de inventarlo.`;

export async function POST(request) {
  try {
    await requireAdmin(request);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno del servidor.' }, { status: 500 });
    }

    const { url } = await request.json();
    if (!url) {
      return NextResponse.json({ error: 'Falta la URL del archivo.' }, { status: 400 });
    }
    // Solo se descargan archivos del propio Storage del proyecto — nunca una
    // URL arbitraria que mande el cliente (aunque esta ruta ya es solo-admin).
    let parsed;
    try { parsed = new URL(url); } catch { parsed = null; }
    if (!parsed || parsed.hostname !== 'firebasestorage.googleapis.com') {
      return NextResponse.json({ error: 'La URL del archivo no es válida.' }, { status: 400 });
    }

    // La descarga se hace desde el servidor (no desde el navegador) porque el
    // bucket de Storage no trae encabezados CORS para que el cliente la lea
    // directo con fetch().
    const archivoRes = await fetch(url);
    if (!archivoRes.ok) {
      return NextResponse.json({ error: 'No se pudo descargar el archivo desde Storage.' }, { status: 502 });
    }
    const mimeType = archivoRes.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await archivoRes.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'El archivo pesa demasiado (máx. 8MB).' }, { status: 400 });
    }
    const fileBase64 = Buffer.from(arrayBuffer).toString('base64');

    const esPdf = mimeType === 'application/pdf';
    const esImagen = mimeType.startsWith('image/');
    if (!esPdf && !esImagen) {
      return NextResponse.json({ error: 'Solo se pueden extraer datos de archivos PDF o imagen (los .docx hay que revisarlos a mano).' }, { status: 400 });
    }

    const archivoBlock = esPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: fileBase64 } };

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: [archivoBlock, { type: 'text', text: PROMPT }] }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      return NextResponse.json({ error: `Error del servicio de extracción: ${errBody}` }, { status: 502 });
    }

    const data = await anthropicRes.json();
    const text = (data.content || []).map((b) => b.text || '').join('\n');

    let extraido;
    try {
      extraido = extractJson(text);
    } catch {
      return NextResponse.json({ error: 'La IA no devolvió un JSON válido: ' + text.slice(0, 300) }, { status: 502 });
    }

    return NextResponse.json({ extraido, generatedAt: Date.now() });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al extraer los datos de la factura' }, { status: err.status || 500 });
  }
}

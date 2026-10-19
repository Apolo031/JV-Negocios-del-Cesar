import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Claude a veces envuelve el JSON en una fila de código ```json ... ``` aunque
 * se le pida "responde exclusivamente en JSON" — se recorta antes de parsear.
 */
function extractJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

export async function POST(request) {
  try {
    await requireAdmin(request);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno del servidor.',
      }, { status: 500 });
    }

    const { imageBase64, mimeType } = await request.json();
    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ error: 'Falta la imagen.' }, { status: 400 });
    }
    if (imageBase64.length * 0.75 > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'La imagen pesa demasiado (máx. 8MB).' }, { status: 400 });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
              {
                type: 'text',
                text: `Analiza esta imagen de joyería y responde EXCLUSIVAMENTE en formato JSON (sin texto adicional, sin fila de código) con esta estructura exacta:
{
  "tipo_producto": "Nombre general (ej. Cadena, Pulsera, Anillo)",
  "tejido_o_estilo": "Nombre exacto del tejido (ej. Fígaro 3x1, Cubano, Chino)",
  "patron": "Breve descripción del patrón visual detectado",
  "confianza": "Alta, Media o Baja"
}`,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      return NextResponse.json({ error: `Error del servicio de identificación: ${errBody}` }, { status: 502 });
    }

    const data = await anthropicRes.json();
    const text = (data.content || []).map((b) => b.text || '').join('\n');

    let identificacion;
    try {
      identificacion = extractJson(text);
    } catch {
      return NextResponse.json({ error: 'La IA no devolvió un JSON válido: ' + text.slice(0, 300) }, { status: 502 });
    }

    return NextResponse.json({ identificacion, generatedAt: Date.now() });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al identificar la joya' }, { status: err.status || 500 });
  }
}

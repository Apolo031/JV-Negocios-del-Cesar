import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAuth } from '@/lib/apiAuth';
import {
  BRANCHES, MONTH_NAMES_FULL, fmtMoney, fmtGr,
  totalFor, totalAll, lastActiveMonth2026,
} from '@/lib/dataHelpers';

export const runtime = 'nodejs';

async function loadMonthly() {
  const snap = await adminDb.collection('monthly').get();
  const monthly = {};
  BRANCHES.forEach((b) => { monthly[b] = { 2025: {}, 2026: {} }; });
  snap.forEach((doc) => {
    const data = doc.data();
    if (!monthly[data.branch]) monthly[data.branch] = { 2025: {}, 2026: {} };
    monthly[data.branch][data.year] = data.metrics;
  });
  return monthly;
}

async function loadWeekly() {
  const snap = await adminDb.collection('weekly').orderBy('fecha').get();
  return snap.docs.map((d) => d.data());
}

function buildSummary(monthly, weekly) {
  const lastM = lastActiveMonth2026(monthly);
  const lines = [];
  lines.push(`Datos de JoyerÃ­as del Cesar (5 sucursales), aÃ±o en curso 2026 hasta ${MONTH_NAMES_FULL[lastM]}, comparado con 2025.`);
  lines.push('');
  lines.push('=== Consolidado 2026 (Ene-' + MONTH_NAMES_FULL[lastM] + ') ===');
  lines.push(`Valor contratado total: ${fmtMoney(totalAll(monthly, '2026', 'valor_contratado', lastM + 1))}`);
  lines.push(`Utilidad total: ${fmtMoney(totalAll(monthly, '2026', 'utilidad', lastM + 1))}`);
  lines.push(`Gramos en contrato: ${fmtGr(totalAll(monthly, '2026', 'gr_contrato', lastM + 1))}`);
  lines.push(`PrÃ³rrogas totales: ${fmtMoney(totalAll(monthly, '2026', 'prorroga', lastM + 1))}`);
  lines.push('');
  lines.push('=== Por sucursal (2026 Ene-' + MONTH_NAMES_FULL[lastM] + ' vs. mismo periodo 2025) ===');
  BRANCHES.forEach((b) => {
    const cutoff = Math.min(lastM + 1, 6);
    const ut26 = totalFor(monthly, b, '2026', 'utilidad', lastM + 1);
    const ut25 = totalFor(monthly, b, '2025', 'utilidad', cutoff);
    const vc26 = totalFor(monthly, b, '2026', 'valor_contratado', lastM + 1);
    const pr26 = totalFor(monthly, b, '2026', 'prorroga', lastM + 1);
    const margen = vc26 ? (ut26 / vc26) * 100 : 0;
    lines.push(`- ${b}: utilidad 2026=${fmtMoney(ut26)} (2025 mismo periodo=${fmtMoney(ut25)}), valor contratado=${fmtMoney(vc26)}, margen=${margen.toFixed(1)}%, prÃ³rrogas=${fmtMoney(pr26)}`);
  });
  lines.push('');
  lines.push('=== Utilidad mes a mes 2026 (todas las sucursales) ===');
  for (let m = 0; m <= lastM; m++) {
    const ut = totalAll(monthly, '2026', 'utilidad', m + 1) - totalAll(monthly, '2026', 'utilidad', m);
    lines.push(`${MONTH_NAMES_FULL[m]}: ${fmtMoney(ut)}`);
  }
  if (weekly.length > 0) {
    lines.push('');
    lines.push('=== Ãšltimos reportes semanales ===');
    weekly.slice(-2).forEach((w) => {
      lines.push(`Semana ${w.fecha}:`);
      Object.entries(w.sucursales || {}).forEach(([b, vals]) => {
        lines.push(`  - ${b}: utilidad=${fmtMoney(vals.utilidad || 0)}, valor contratado=${fmtMoney(vals.valor_contratado || 0)}`);
      });
    });
  }
  return lines.join('\n');
}

export async function POST(request) {
  try {
    await requireAuth(request);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno del servidor.',
      }, { status: 500 });
    }

    const [monthly, weekly] = await Promise.all([loadMonthly(), loadWeekly()]);
    const summary = buildSummary(monthly, weekly);

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        system: 'Eres un analista financiero que ayuda al dueÃ±o de una cadena de joyerÃ­as/casas de empeÃ±o en Colombia (prÃ©stamos sobre oro y plata) a entender sus nÃºmeros y tomar decisiones. Responde siempre en espaÃ±ol, en prosa clara y directa, sin relleno. Estructura la respuesta en: 1) un resumen de 2-3 frases del panorama general, 2) quÃ© sucursales van bien y cuÃ¡les necesitan atenciÃ³n (con la razÃ³n concreta, citando cifras), 3) 3 a 5 recomendaciones puntuales y accionables. No inventes datos que no estÃ©n en el resumen que te dan.',
        messages: [
          { role: 'user', content: `AquÃ­ estÃ¡n los datos actuales del negocio:\n\n${summary}\n\nDame tu anÃ¡lisis y recomendaciones.` },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      return NextResponse.json({ error: `Error del servicio de anÃ¡lisis: ${errBody}` }, { status: 502 });
    }

    const data = await anthropicRes.json();
    const text = (data.content || []).map((b) => b.text || '').join('\n');

    return NextResponse.json({ analysis: text, generatedAt: Date.now() });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al generar el anÃ¡lisis' }, { status: err.status || 500 });
  }
}
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

// Google Sheet maestro "CONTRATOS GEOLOCALIZACION" de Zona Centro Inmobiliaria
// (compartido como "Cualquier persona con el enlace puede ver"). Esta ruta
// descarga su export a .xlsx desde el SERVIDOR — un fetch directo desde el
// navegador a docs.google.com queda bloqueado por CORS, igual que pasaba con
// los archivos de Storage (ver /api/extraer-factura).
//
// El ID de la hoja vive en una variable de entorno (INMUEBLES_SHEET_ID), NO
// escrito en el código: como la hoja es pública por enlace, ese ID por sí
// solo le da a cualquiera acceso de lectura a todos sus datos (propietarios,
// cuentas bancarias, etc.) — exactamente igual que una clave, así que no
// puede quedar en el repositorio.
export async function GET(request) {
  try {
    await requireAdmin(request);

    const sheetId = process.env.INMUEBLES_SHEET_ID;
    if (!sheetId) {
      return NextResponse.json({ error: 'Falta configurar INMUEBLES_SHEET_ID en las variables de entorno del servidor.' }, { status: 500 });
    }

    const sheetRes = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`);
    if (!sheetRes.ok) {
      return NextResponse.json({
        error: 'No se pudo descargar la hoja de Google. Revisa que siga compartida como "Cualquier persona con el enlace puede ver".',
      }, { status: 502 });
    }
    const buffer = Buffer.from(await sheetRes.arrayBuffer());
    // Si Google no pudo exportarla (por ejemplo, el acceso se cerró de nuevo)
    // regresa una página HTML de error en vez del archivo — se detecta
    // revisando que empiece con la firma real de un .xlsx ("PK").
    if (buffer.length < 4 || buffer.slice(0, 2).toString('ascii') !== 'PK') {
      return NextResponse.json({
        error: 'La hoja de Google no está disponible públicamente ahora mismo (puede que se haya restringido el acceso). Revisa que siga compartida como "Cualquier persona con el enlace puede ver".',
      }, { status: 502 });
    }

    return new NextResponse(buffer, {
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al descargar la hoja de Google' }, { status: err.status || 500 });
  }
}

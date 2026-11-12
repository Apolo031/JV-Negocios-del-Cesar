// Lector de la hoja "COLOMBIA" del Excel maestro de Zona Centro Inmobiliaria.
//
// Esta hoja es la que mantiene el equipo (no el export del software): trae por
// contrato la ocupación, la sociedad, el grupo, el tipo de inmueble, los
// metros², el canon al 100 %, hasta 6 propietarios (cada uno con su % y su
// canon) y quién administra cada parte, el seguro (aseguradora, valor
// asegurado, prima antes de IVA) y el incremento (% o "IPC+2", día y mes).
//
// Se lee por NOMBRE de encabezado, no por posición: la hoja repite encabezados
// (PORCENTAJE / CANON POR PROPIETARIO / ADMINISTRADO POR, seis veces), tiene
// columnas sin título y errores de ortografía (DIRECCCION, PROPETARIO,
// ADMINITRADO), y le agregan columnas con el tiempo. Cada bloque de
// propietario se identifica por "PROPETARIO n" y toma las 3 columnas que le
// siguen.

const norm = (s) =>
  String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

function texto(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  // "#N/A" sale de las fórmulas de la hoja; "/ /" y "####" son fechas/celdas vacías.
  if (s === '' || s === '/ /' || /^#+$/.test(s) || /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?)$/i.test(s)) return null;
  return s;
}

/** "$16,278,301" / "16.278.301" / 16278301 → 16278301 */
export function dinero(v) {
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  const c = s.lastIndexOf(','), p = s.lastIndexOf('.');
  let t = s;
  if (c > -1 && p > -1) t = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c > -1) t = /,\d{1,2}$/.test(s) && (s.match(/,/g) || []).length === 1 ? s.replace(',', '.') : s.replace(/,/g, '');
  else if (p > -1) t = /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

/** 0.1667 (celda con formato %) → 16.67 ; "55.56%" → 55.56 ; 100 → 100 */
function porcentaje(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v <= 1 ? +(v * 100).toFixed(2) : v;
  const n = parseFloat(String(v).replace('%', '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/**
 * filas: matriz (array de arrays) de la hoja, tal como la entrega
 * XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null }).
 * Devuelve { contratos, avisos }.
 */
export function leerFilasColombia(filas) {
  const h = filas.findIndex((r) => {
    const n = (r || []).map(norm);
    return n.includes('CONTRATO') && n.includes('ARRENDATARIO');
  });
  if (h < 0) return { contratos: [], avisos: ['No se encontró la fila de encabezados de la hoja COLOMBIA (CONTRATO / ARRENDATARIO).'] };

  const head = filas[h].map(norm);
  const col = (...nombres) => { for (const n of nombres) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const empieza = (pref) => head.findIndex((x) => x.startsWith(pref));

  const C = {
    ocupacion: col('OCUPACION'), contrato: col('CONTRATO'), arrendatario: col('ARRENDATARIO'),
    direccion: empieza('DIRECC'), municipio: col('MUNICIPIO'), fotos: col('FOTOS'), metros: empieza('METROS'),
    sociedad: col('SOCIEDAD'), grupo: col('GRUPO'), tipo: col('TIPO DE INMUEBLE'), obs: empieza('OBSERV'),
    canon: col('CANON 100%'), seguro: col('SEGURO'), valorAsegurado: col('VALOR ASEGURADO'),
    prima: col('PRIMA ANTES DE IVA'), dia: col('DIA'), mes: col('MES'), mesNombre: col('MES ALFABETICO'),
  };
  // Después de la prima viene el "PORCENTAJE" de incremento (10, 8, "IPC+2"…).
  C.incremento = C.prima >= 0 && head[C.prima + 1] === 'PORCENTAJE' ? C.prima + 1 : -1;

  const bloques = [];
  head.forEach((x, i) => { if (/^PROP[IE]+TARIO \d+$/.test(x)) bloques.push(i); });

  const avisos = [];
  for (const k of ['contrato', 'canon']) if (C[k] < 0) avisos.push(`La hoja COLOMBIA no trae la columna ${k.toUpperCase()}.`);
  if (bloques.length === 0) avisos.push('La hoja COLOMBIA no trae columnas de propietarios (PROPETARIO 1…6).');

  // Nombres únicos por columna para guardar la fila completa tal cual viene
  // (los encabezados repetidos reciben un sufijo: "PORCENTAJE (2)").
  const usados = {};
  const nombresCol = filas[h].map((x, i) => {
    const base = texto(x) || `col_${i + 1}`;
    usados[base] = (usados[base] || 0) + 1;
    return usados[base] > 1 ? `${base} (${usados[base]})` : base;
  });

  const contratos = [];
  for (let r = h + 1; r < filas.length; r++) {
    const f = filas[r] || [];
    const g = (i) => (i < 0 ? null : f[i]);
    const contrato = texto(g(C.contrato));
    if (!contrato) continue; // fila vacía o de relleno al final de la hoja

    const propietarios = [];
    for (const i of bloques) {
      const nombre = texto(g(i));
      if (!nombre) continue;
      propietarios.push({
        nombre,
        porcentaje: porcentaje(g(i + 1)),
        canon: dinero(g(i + 2)),
        administradoPor: texto(g(i + 3)),
      });
    }
    const canon100 = dinero(g(C.canon));
    const sumaPct = +propietarios.reduce((a, p) => a + p.porcentaje, 0).toFixed(2);
    const sumaCanon = propietarios.reduce((a, p) => a + p.canon, 0);

    // Avisos de calidad de datos (para corregirlos en la hoja, no del lector).
    const alertas = [];
    if (propietarios.length === 0 && /ACTIV/i.test(texto(g(C.ocupacion)) || '')) alertas.push('Sin propietarios en la hoja COLOMBIA');
    if (propietarios.length && Math.abs(sumaPct - 100) > 0.05) alertas.push(`Los porcentajes de los propietarios suman ${sumaPct}%`);
    if (propietarios.length && canon100 && Math.abs(sumaCanon - canon100) > Math.max(5, canon100 * 0.001)) {
      alertas.push('El canon por propietario no cuadra con el canon al 100%');
    }

    contratos.push({
      ocupacion: texto(g(C.ocupacion)),
      contrato,
      arrendatario: texto(g(C.arrendatario)),
      direccion: texto(g(C.direccion)),
      municipio: texto(g(C.municipio)),
      tieneFotos: /^x$/i.test(texto(g(C.fotos)) || ''),
      metros2: texto(g(C.metros)),
      sociedad: texto(g(C.sociedad)),
      grupo: texto(g(C.grupo)),
      tipoInmueble: texto(g(C.tipo)),
      observaciones: texto(g(C.obs)),
      canon100,
      propietarios,
      seguro: {
        aseguradora: texto(g(C.seguro)),
        valorAsegurado: dinero(g(C.valorAsegurado)),
        primaAntesIva: dinero(g(C.prima)),
      },
      incremento: texto(g(C.incremento)), // 10, 8, 5 o "IPC+2"
      diaIncremento: texto(g(C.dia)),
      mesIncremento: texto(g(C.mes)),
      mesNombre: texto(g(C.mesNombre)),
      alertas,
      raw: Object.fromEntries(
        f.map((v, i) => [nombresCol[i], typeof v === 'string' ? v.trim() : v]).filter(([, v]) => v !== null && v !== undefined && v !== '' && !/^#/.test(String(v)))
      ),
    });
  }
  return { contratos, avisos };
}

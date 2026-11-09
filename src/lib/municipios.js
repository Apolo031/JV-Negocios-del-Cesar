// Normaliza nombres de municipio y arma el "slug" de cada uno para la URL
// de su espacio dedicado (ej. "LA CEJA" -> "la-ceja"). El mismo municipio
// puede venir escrito distinto según la fuente (Excel de Base principal,
// nombre de carpeta al subir facturas...), así que todo se compara por esta
// forma normalizada (sin tildes, en mayúsculas) en vez del texto tal cual.

import { stripAccents } from './importHelpers';

export function normalizarMunicipio(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t ? stripAccents(t).toUpperCase() : null;
}

/** "LA CEJA" -> "la-ceja". Los nombres reales son solo palabras separadas por espacio, así que es reversible con municipioDeSlug(). */
export function municipioASlug(normalizado) {
  if (!normalizado) return '';
  return normalizado.toLowerCase().trim().replace(/\s+/g, '-');
}

/** "la-ceja" -> "LA CEJA" (la misma clave normalizada que arma normalizarMunicipio). */
export function municipioDeSlug(slug) {
  if (!slug) return null;
  return decodeURIComponent(slug).replace(/-/g, ' ').toUpperCase().trim();
}

/** "LA CEJA" -> "La Ceja", para mostrar en títulos y botones. */
export function tituloMunicipio(normalizado) {
  if (!normalizado) return '';
  return normalizado
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

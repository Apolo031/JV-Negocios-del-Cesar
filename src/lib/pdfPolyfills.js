// pdf-parse usa pdfjs-dist por dentro, y aunque solo necesitamos extraer
// texto, el módulo de pdfjs-dist que arma internamente también carga su
// parte de renderizado en canvas — que hace `new DOMMatrix()` apenas se
// importa el módulo, sin que lo llamemos nosotros. DOMMatrix es una API de
// navegador y no existe en el runtime de Node de Vercel, así que hay que
// definirla antes de que se cargue pdf-parse. Debe ser el PRIMER import del
// archivo que llame a pdf-parse (los imports de ES modules se evalúan en el
// orden en que aparecen).
import CSSMatrix from '@thednp/dommatrix';

if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = CSSMatrix;
}

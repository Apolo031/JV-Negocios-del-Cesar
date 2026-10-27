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

// pdfjs-dist intenta montar su "worker" con un `import()` dinámico marcado
// como `webpackIgnore` (para que, en el navegador, sea el navegador quien lo
// resuelva) — pero eso significa que el empaquetador de Next nunca lo ve, y
// Vercel no lo incluye en la función serverless ("Cannot find module
// .../pdf.worker.mjs"). Si nosotros mismos importamos ese archivo de forma
// normal y lo dejamos en `globalThis.pdfjsWorker`, pdfjs-dist lo usa
// directo sin pasar por ese import dinámico.
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
globalThis.pdfjsWorker = pdfjsWorker;

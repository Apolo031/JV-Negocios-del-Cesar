// Parser del archivo de "Facturas" (R+R: retiros y renovaciones) — un
// registro por factura/transacción sobre un contrato, enlazada a Contratos
// por "Secuencia Contrato". Se importa desde un Excel o CSV con las columnas
// de siempre.

import * as XLSX from 'xlsx';
import { normalizedRow, mapRow, readWorkbook, pickSheetByHeaders, slugifyId } from './importHelpers';

export { slugifyId };

// [encabezado normalizado, nombre del campo, tipo]
const FIELD_MAP = [
  ['joyeria', 'joyeria', 'string'],
  ['codigo joyeria', 'codigoJoyeria', 'string'],
  ['secuencia factura', 'secuenciaFactura', 'string'],
  ['operacion', 'operacion', 'string'],
  ['secuencia operacion', 'secuenciaOperacion', 'string'],
  ['secuencia contrato', 'secuenciaContrato', 'string'],
  ['usuario', 'usuario', 'string'],
  ['fecha factura', 'fechaFactura', 'date'],
  ['cliente documento', 'clienteDocumento', 'string'],
  ['cliente nombre', 'clienteNombre', 'string'],
  ['factura gramos', 'facturaGramos', 'number'],
  ['subtotal', 'subtotal', 'number'],
  ['descuento', 'descuento', 'number'],
  ['subtotal con descuento', 'subtotalConDescuento', 'number'],
  ['impuestos valor', 'impuestosValor', 'number'],
  ['valor total', 'valorTotal', 'number'],
  ['retenciones valor', 'retencionesValor', 'number'],
  ['valor pagado', 'valorPagado', 'number'],
  ['cantidad productos', 'cantidadProductos', 'number'],
  ['estado', 'estado', 'string'],
  ['estado facturacion electronica', 'estadoFacturacionElectronica', 'string'],
  ['cliente telefono', 'clienteTelefono', 'string'],
  ['fecha operacion', 'fechaOperacion', 'date'],
];

const FIELD_HEADERS = new Set(FIELD_MAP.map(([header]) => header));

/** Parsea un ArrayBuffer/Uint8Array (.xlsx, .xls o .csv) a facturas planas. */
export function parseFacturasBuffer(input) {
  const workbook = readWorkbook(input);
  const ws = pickSheetByHeaders(workbook, FIELD_HEADERS);
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });

  const facturas = [];
  for (const row of rows) {
    const factura = mapRow(normalizedRow(row), FIELD_MAP);
    // Fila vacía (sin secuencia de factura) — se descarta, no es un registro real.
    if (!factura.secuenciaFactura) continue;
    facturas.push(factura);
  }
  return facturas;
}

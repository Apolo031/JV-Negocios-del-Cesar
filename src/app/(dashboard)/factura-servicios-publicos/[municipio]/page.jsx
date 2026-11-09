'use client';

import FacturaServiciosView from '../FacturaServiciosView';
import { municipioDeSlug, tituloMunicipio } from '@/lib/municipios';

/** /factura-servicios-publicos/todos = ver todos los municipios juntos (sin fijar ninguno). */
export default function EspacioMunicipioPage({ params }) {
  const esTodos = params.municipio === 'todos';
  const municipioFiltro = esTodos ? null : municipioDeSlug(params.municipio);
  const municipioLabel = esTodos ? null : tituloMunicipio(municipioFiltro);

  return <FacturaServiciosView municipioFiltro={municipioFiltro} municipioLabel={municipioLabel} />;
}

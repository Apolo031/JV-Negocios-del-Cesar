// Checklist base para el seguimiento de apertura de una joyería nueva —
// reorganizado por área responsable a partir del Excel "Seguimiento-Metro"
// que se usaba antes para controlar manualmente cada apertura.
//
// Cuando se crea una "apertura" (sucursal nueva), se copia este template
// completo a la colección `apertura_items` con estado "pendiente" en todas
// las tareas — así cada sucursal tiene su propia copia editable, sin afectar
// a las demás ni a este template.

// Mismos 5 grupos que se usan en el tablero de ClickUp de aperturas, para
// que ambas herramientas queden organizadas igual.
export const APERTURA_AREAS = [
  { key: 'legal', nombre: 'Documento legal' },
  { key: 'seguridad', nombre: 'Seguridad y montaje' },
  { key: 'operacion_interna', nombre: 'Operación interna' },
  { key: 'gestion_humana', nombre: 'Gestión Humana' },
  { key: 'marketing', nombre: 'Marketing y ventas' },
];

// Antes había 12 áreas más desglosadas; se fusionaron en los 5 grupos de
// arriba. Esto traduce esas claves viejas (que pueden seguir guardadas en
// tareas creadas antes de la fusión) a su grupo nuevo, sin tener que tocar
// nada en la base de datos.
const AREA_REMAP = {
  tecnologia: 'operacion_interna', finanzas: 'operacion_interna', papeleria: 'operacion_interna',
  insumos: 'operacion_interna', electrodomesticos: 'operacion_interna', inventario: 'operacion_interna',
  procesos: 'operacion_interna', fabricacion: 'marketing',
};
export function areaCanonica(area) {
  return AREA_REMAP[area] || area;
}

// Tareas creadas antes de agregar el campo `padreConcepto` (ej. en "joyeria
// Metro") no lo tienen guardado — esto cubre esos casos ya existentes para
// que de todas formas se vean anidadas bajo su tarea principal, sin tener
// que tocar nada en la base de datos. Las tareas nuevas ya guardan
// `padreConcepto` directamente (ver APERTURA_TEMPLATE más abajo).
const FALLBACK_PADRE_CONCEPTO = {
  'Uso de suelos': 'Permisos municipales',
  'Sayco & Acinpro': 'Permisos municipales',
  'Sanidad': 'Permisos municipales',
  'Bomberos': 'Permisos municipales',
  'Carta a la estación de policía': 'Permisos municipales',
};
export function padreDe(item) {
  return item.padreConcepto || FALLBACK_PADRE_CONCEPTO[item.concepto] || null;
}

export const APERTURA_TEMPLATE = [
  // Documento legal
  { area: 'legal', concepto: 'Nombre de la joyería y sociedad a la que pertenece' },
  { area: 'legal', concepto: 'Actualización del RUT de la sociedad' },
  { area: 'legal', concepto: 'Código contable para la asignación de la joyería' },
  { area: 'legal', concepto: 'Autorización de resolución de facturación' },
  { area: 'legal', concepto: 'Inscripción en la cámara de comercio' },
  { area: 'legal', concepto: 'Inscripción de industria y comercio' },
  { area: 'legal', concepto: 'Permisos municipales' },
  { area: 'legal', concepto: 'Uso de suelos', padreConcepto: 'Permisos municipales' },
  { area: 'legal', concepto: 'Sayco & Acinpro', padreConcepto: 'Permisos municipales' },
  { area: 'legal', concepto: 'Sanidad', padreConcepto: 'Permisos municipales' },
  { area: 'legal', concepto: 'Bomberos', padreConcepto: 'Permisos municipales' },
  { area: 'legal', concepto: 'Carta a la estación de policía', padreConcepto: 'Permisos municipales' },

  // Seguridad y montaje
  { area: 'seguridad', concepto: 'Planos de la joyería para el montaje' },
  { area: 'seguridad', concepto: 'Espacio para probador de joyas' },
  { area: 'seguridad', concepto: 'Espacio de cocina y locker para colaboradores' },
  { area: 'seguridad', concepto: 'Espacio de escritorio y cafetín' },
  { area: 'seguridad', concepto: 'Puntos de aire acondicionado y eléctricos' },
  { area: 'seguridad', concepto: 'Espacio para espejo' },
  { area: 'seguridad', concepto: 'Validación de seguridad locativa' },
  { area: 'seguridad', concepto: 'Validación de paredes' },
  { area: 'seguridad', concepto: 'Validación de techo' },
  { area: 'seguridad', concepto: 'Validación de pisos' },
  { area: 'seguridad', concepto: 'Instalación de blindaje' },
  { area: 'seguridad', concepto: 'Caja fuerte' },
  { area: 'seguridad', concepto: 'Caja en la joyería' },
  { area: 'seguridad', concepto: 'Cerradura Cenco de la caja fuerte' },
  { area: 'seguridad', concepto: 'Temporizador de la caja fuerte' },
  { area: 'seguridad', concepto: 'Instalación de bunker' },
  { area: 'seguridad', concepto: 'Instalación de internet y línea telefónica' },
  { area: 'seguridad', concepto: 'Instalación de alarma y cámaras' },
  { area: 'seguridad', concepto: 'Cuadros informativos normativos' },
  { area: 'seguridad', concepto: 'Bandeja de teclado' },
  { area: 'seguridad', concepto: 'Guaya o sistema de seguridad para exhibición' },
  { area: 'seguridad', concepto: 'Estación portátil Ecoflow' },

  // Operación interna (tecnología, finanzas, papelería, insumos, electrodomésticos, inventario, procesos)
  { area: 'operacion_interna', concepto: 'Equipo de cómputo' },
  { area: 'operacion_interna', concepto: 'Impresora' },
  { area: 'operacion_interna', concepto: 'UPS' },
  { area: 'operacion_interna', concepto: 'Huellero' },
  { area: 'operacion_interna', concepto: 'Cámara' },
  { area: 'operacion_interna', concepto: 'Celular corporativo' },
  { area: 'operacion_interna', concepto: 'Intercomunicadores' },
  { area: 'operacion_interna', concepto: 'Creación de correos electrónicos' },
  { area: 'operacion_interna', concepto: 'Usuario SINDRI' },
  { area: 'operacion_interna', concepto: 'Activación de punto EFECTY' },
  { area: 'operacion_interna', concepto: 'Usuario Efecty' },
  { area: 'operacion_interna', concepto: 'Moneda de publicidad' },
  { area: 'operacion_interna', concepto: 'Usuario MoneyGram' },
  { area: 'operacion_interna', concepto: 'Usuario MSRED (letra de cambio)' },
  { area: 'operacion_interna', concepto: 'Aviso de publicidad MASRED' },
  { area: 'operacion_interna', concepto: 'Código Masred' },
  { area: 'operacion_interna', concepto: 'Papelería de contingencia' },
  { area: 'operacion_interna', concepto: 'Contratos preimpresos' },
  { area: 'operacion_interna', concepto: 'Talonario de facturación' },
  { area: 'operacion_interna', concepto: 'Libro de registro' },
  { area: 'operacion_interna', concepto: 'Mueble de oficina' },
  { area: 'operacion_interna', concepto: 'Sillas para clientes y colaboradores' },
  { area: 'operacion_interna', concepto: 'Escritorios' },
  { area: 'operacion_interna', concepto: 'Probador de joyería' },
  { area: 'operacion_interna', concepto: 'TV' },
  { area: 'operacion_interna', concepto: 'Insumos de contratación' },
  { area: 'operacion_interna', concepto: 'Tester' },
  { area: 'operacion_interna', concepto: 'Limas' },
  { area: 'operacion_interna', concepto: 'Bolsa de seguridad' },
  { area: 'operacion_interna', concepto: 'Gramera' },
  { area: 'operacion_interna', concepto: 'Lupas' },
  { area: 'operacion_interna', concepto: 'Paños para brillar' },
  { area: 'operacion_interna', concepto: 'Medidor de anillos' },
  { area: 'operacion_interna', concepto: 'Imán' },
  { area: 'operacion_interna', concepto: 'Horno microondas' },
  { area: 'operacion_interna', concepto: 'Nevera' },
  { area: 'operacion_interna', concepto: 'Dispensador de agua' },
  { area: 'operacion_interna', concepto: 'Cafetera' },
  { area: 'operacion_interna', concepto: 'Oro para vitrina' },
  { area: 'operacion_interna', concepto: 'Plata Rosset' },
  { area: 'operacion_interna', concepto: 'Rolejería Luxe' },
  { area: 'operacion_interna', concepto: 'Manuales internos de procesos y procedimientos' },
  { area: 'operacion_interna', concepto: 'Porcentajes y términos normativos de contratación' },

  // Gestión Humana
  { area: 'gestion_humana', concepto: 'Afiliación del personal nuevo' },
  { area: 'gestion_humana', concepto: 'Dotación para el personal nuevo' },
  { area: 'gestion_humana', concepto: 'Capacitación del personal' },
  { area: 'gestion_humana', concepto: 'Registro y uso del software' },

  // Marketing y ventas (marketing + fabricación y exhibición)
  { area: 'marketing', concepto: 'Plotter de joyería' },
  { area: 'marketing', concepto: 'Aviso, letreros y valla' },
  { area: 'marketing', concepto: 'Exitómetro' },
  { area: 'marketing', concepto: 'Creación de perfil de Google' },
  { area: 'marketing', concepto: 'Publicidad en redes sociales' },
  { area: 'marketing', concepto: 'Publicidad y decoración para el lanzamiento' },
  { area: 'marketing', concepto: 'Tablero de precio de contratación' },
  { area: 'marketing', concepto: 'Tableros de publicidad' },
  { area: 'marketing', concepto: 'Fabricación de oro y plata' },
  { area: 'marketing', concepto: 'Mapa de las sedes' },
  { area: 'marketing', concepto: 'Lingote de oro' },
  { area: 'marketing', concepto: 'Horario de apertura de la joyería' },
  { area: 'marketing', concepto: 'Colores corporativos (paredes, fachada y rejas)' },
  { area: 'marketing', concepto: 'Espejos habladores' },
  { area: 'marketing', concepto: 'Exhibidores de lingotes' },
  { area: 'marketing', concepto: 'Exhibidores de vitrina' },
  { area: 'marketing', concepto: 'Volantes' },
  { area: 'marketing', concepto: 'Tarjetas de garantía' },
  { area: 'marketing', concepto: 'Tarjetas de presentación' },
  { area: 'marketing', concepto: 'Estuche de joyería' },
  { area: 'marketing', concepto: 'Bolsas de paño' },
  { area: 'marketing', concepto: 'Bolsas de papel' },
];

export const ESTADOS_APERTURA = ['pendiente', 'en_proceso', 'completado'];
export const ESTADO_LABEL = { pendiente: 'Pendiente', en_proceso: 'En proceso', completado: 'Completado' };

// Mismo orden y nombres que el menú de prioridad de ClickUp (Urgente, Alta,
// Normal, Baja, Borrar) — "ninguna" hace las veces de "Borrar" (sin prioridad).
export const PRIORIDADES = ['urgente', 'alta', 'normal', 'baja', 'ninguna'];
export const PRIORIDAD_LABEL = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baja: 'Baja', ninguna: 'Ninguna' };
export const PRIORIDAD_COLOR = {
  urgente: 'var(--red)', alta: 'var(--gold)', normal: 'var(--blue)', baja: 'var(--text-dim)', ninguna: 'var(--text-dimmer)',
};

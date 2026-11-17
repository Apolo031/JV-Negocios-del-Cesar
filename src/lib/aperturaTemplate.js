// Checklist base para el seguimiento de apertura de una joyería nueva —
// reorganizado por área responsable a partir del Excel "Seguimiento-Metro"
// que se usaba antes para controlar manualmente cada apertura.
//
// Cuando se crea una "apertura" (sucursal nueva), se copia este template
// completo a la colección `apertura_items` con estado "pendiente" en todas
// las tareas — así cada sucursal tiene su propia copia editable, sin afectar
// a las demás ni a este template.

export const APERTURA_AREAS = [
  { key: 'legal', nombre: 'Documentación legal y permisos' },
  { key: 'seguridad', nombre: 'Seguridad y montaje' },
  { key: 'tecnologia', nombre: 'Tecnología y sistemas' },
  { key: 'finanzas', nombre: 'Finanzas y medios de pago' },
  { key: 'papeleria', nombre: 'Papelería y mobiliario' },
  { key: 'insumos', nombre: 'Insumos y herramientas de joyería' },
  { key: 'electrodomesticos', nombre: 'Electrodomésticos' },
  { key: 'inventario', nombre: 'Inventario' },
  { key: 'procesos', nombre: 'Procesos y normativa interna' },
  { key: 'gestion_humana', nombre: 'Gestión humana' },
  { key: 'marketing', nombre: 'Marketing y publicidad' },
  { key: 'fabricacion', nombre: 'Fabricación y exhibición' },
];

export const APERTURA_TEMPLATE = [
  // Documentación legal y permisos
  { area: 'legal', concepto: 'Nombre de la joyería y sociedad a la que pertenece' },
  { area: 'legal', concepto: 'Actualización del RUT de la sociedad' },
  { area: 'legal', concepto: 'Código contable para la asignación de la joyería' },
  { area: 'legal', concepto: 'Autorización de resolución de facturación' },
  { area: 'legal', concepto: 'Inscripción en la cámara de comercio' },
  { area: 'legal', concepto: 'Inscripción de industria y comercio' },
  { area: 'legal', concepto: 'Permisos municipales' },
  { area: 'legal', concepto: 'Uso de suelos' },
  { area: 'legal', concepto: 'Sayco & Acinpro' },
  { area: 'legal', concepto: 'Sanidad' },
  { area: 'legal', concepto: 'Bomberos' },
  { area: 'legal', concepto: 'Carta a la estación de policía' },

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

  // Tecnología y sistemas
  { area: 'tecnologia', concepto: 'Equipo de cómputo' },
  { area: 'tecnologia', concepto: 'Impresora' },
  { area: 'tecnologia', concepto: 'UPS' },
  { area: 'tecnologia', concepto: 'Huellero' },
  { area: 'tecnologia', concepto: 'Cámara' },
  { area: 'tecnologia', concepto: 'Celular corporativo' },
  { area: 'tecnologia', concepto: 'Intercomunicadores' },
  { area: 'tecnologia', concepto: 'Creación de correos electrónicos' },
  { area: 'tecnologia', concepto: 'Usuario SINDRI' },

  // Finanzas y medios de pago
  { area: 'finanzas', concepto: 'Activación de punto EFECTY' },
  { area: 'finanzas', concepto: 'Usuario Efecty' },
  { area: 'finanzas', concepto: 'Moneda de publicidad' },
  { area: 'finanzas', concepto: 'Usuario MoneyGram' },
  { area: 'finanzas', concepto: 'Usuario MSRED (letra de cambio)' },
  { area: 'finanzas', concepto: 'Aviso de publicidad MASRED' },
  { area: 'finanzas', concepto: 'Código Masred' },

  // Papelería y mobiliario
  { area: 'papeleria', concepto: 'Papelería de contingencia' },
  { area: 'papeleria', concepto: 'Contratos preimpresos' },
  { area: 'papeleria', concepto: 'Talonario de facturación' },
  { area: 'papeleria', concepto: 'Libro de registro' },
  { area: 'papeleria', concepto: 'Mueble de oficina' },
  { area: 'papeleria', concepto: 'Sillas para clientes y colaboradores' },
  { area: 'papeleria', concepto: 'Escritorios' },
  { area: 'papeleria', concepto: 'Probador de joyería' },
  { area: 'papeleria', concepto: 'TV' },

  // Insumos y herramientas de joyería
  { area: 'insumos', concepto: 'Insumos de contratación' },
  { area: 'insumos', concepto: 'Tester' },
  { area: 'insumos', concepto: 'Limas' },
  { area: 'insumos', concepto: 'Bolsa de seguridad' },
  { area: 'insumos', concepto: 'Gramera' },
  { area: 'insumos', concepto: 'Lupas' },
  { area: 'insumos', concepto: 'Paños para brillar' },
  { area: 'insumos', concepto: 'Medidor de anillos' },
  { area: 'insumos', concepto: 'Imán' },

  // Electrodomésticos
  { area: 'electrodomesticos', concepto: 'Horno microondas' },
  { area: 'electrodomesticos', concepto: 'Nevera' },
  { area: 'electrodomesticos', concepto: 'Dispensador de agua' },
  { area: 'electrodomesticos', concepto: 'Cafetera' },

  // Inventario
  { area: 'inventario', concepto: 'Oro para vitrina' },
  { area: 'inventario', concepto: 'Plata Rosset' },
  { area: 'inventario', concepto: 'Rolejería Luxe' },

  // Procesos y normativa interna
  { area: 'procesos', concepto: 'Manuales internos de procesos y procedimientos' },
  { area: 'procesos', concepto: 'Porcentajes y términos normativos de contratación' },

  // Gestión humana
  { area: 'gestion_humana', concepto: 'Afiliación del personal nuevo' },
  { area: 'gestion_humana', concepto: 'Dotación para el personal nuevo' },
  { area: 'gestion_humana', concepto: 'Capacitación del personal' },
  { area: 'gestion_humana', concepto: 'Registro y uso del software' },

  // Marketing y publicidad
  { area: 'marketing', concepto: 'Plotter de joyería' },
  { area: 'marketing', concepto: 'Aviso, letreros y valla' },
  { area: 'marketing', concepto: 'Exitómetro' },
  { area: 'marketing', concepto: 'Creación de perfil de Google' },
  { area: 'marketing', concepto: 'Publicidad en redes sociales' },
  { area: 'marketing', concepto: 'Publicidad y decoración para el lanzamiento' },
  { area: 'marketing', concepto: 'Tablero de precio de contratación' },
  { area: 'marketing', concepto: 'Tableros de publicidad' },

  // Fabricación y exhibición
  { area: 'fabricacion', concepto: 'Fabricación de oro y plata' },
  { area: 'fabricacion', concepto: 'Mapa de las sedes' },
  { area: 'fabricacion', concepto: 'Lingote de oro' },
  { area: 'fabricacion', concepto: 'Horario de apertura de la joyería' },
  { area: 'fabricacion', concepto: 'Colores corporativos (paredes, fachada y rejas)' },
  { area: 'fabricacion', concepto: 'Espejos habladores' },
  { area: 'fabricacion', concepto: 'Exhibidores de lingotes' },
  { area: 'fabricacion', concepto: 'Exhibidores de vitrina' },
  { area: 'fabricacion', concepto: 'Volantes' },
  { area: 'fabricacion', concepto: 'Tarjetas de garantía' },
  { area: 'fabricacion', concepto: 'Tarjetas de presentación' },
  { area: 'fabricacion', concepto: 'Estuche de joyería' },
  { area: 'fabricacion', concepto: 'Bolsas de paño' },
  { area: 'fabricacion', concepto: 'Bolsas de papel' },
];

export const ESTADOS_APERTURA = ['pendiente', 'en_proceso', 'completado'];
export const ESTADO_LABEL = { pendiente: 'Pendiente', en_proceso: 'En proceso', completado: 'Completado' };

export const PRIORIDADES = ['ninguna', 'baja', 'media', 'alta', 'urgente'];
export const PRIORIDAD_LABEL = { ninguna: 'Ninguna', baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };
export const PRIORIDAD_COLOR = {
  ninguna: 'var(--text-dimmer)', baja: 'var(--text-dim)', media: 'var(--gold-light)', alta: 'var(--gold)', urgente: 'var(--red)',
};

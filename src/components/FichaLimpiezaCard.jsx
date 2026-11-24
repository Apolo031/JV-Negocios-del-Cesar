// Tarjeta de la ficha de "Limpieza gratis" — mismo diseño (navy/dorado, logo
// de Oroexpress) tanto en el panel interno (al completar la ficha) como en la
// página pública que recibe el cliente por WhatsApp. Colores fijos de marca,
// no las variables de tema de la app: es un documento para el cliente, debe
// verse igual sin importar si quien lo generó tiene el panel en modo claro
// u oscuro.

function fmtFechaCorta(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function FichaLimpiezaCard({ limpieza }) {
  return (
    <div style={{ border: '1px solid #e2dcca', borderRadius: 12, overflow: 'hidden', maxWidth: 420, background: '#fff', width: '100%' }}>
      <div style={{ background: 'linear-gradient(135deg, #12151c, #2a3242)', padding: '20px 20px 60px' }}>
        <img src="/oroexpress-logo.webp" alt="Oroexpress" style={{ height: 24, marginBottom: 12 }} />
        <div style={{ color: '#c7a339', fontSize: 10.5, letterSpacing: 0.5, marginTop: -8 }}>COMPRAVENTA Y JOYERÍA · LIMPIEZA GRATIS</div>
        {limpieza.fotoUrl && (
          <img src={limpieza.fotoUrl} alt="Foto de la joya" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '2px solid #e8cd7a', float: 'right', marginTop: -36 }} />
        )}
        <div style={{ color: '#e8cd7a', fontWeight: 700, fontSize: 22, marginTop: 20 }}>
          {[limpieza.categoria, limpieza.metal, limpieza.kilataje].filter(Boolean).join(' · ') || '—'}
          {limpieza.pesoGramos ? ` · ${limpieza.pesoGramos} g` : ''}
        </div>
        <div style={{ color: '#fff', fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, marginTop: 10 }}>{limpieza.codigo}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: '#8d96ac' }}>TITULAR</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{limpieza.nombreCliente}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#8d96ac' }}>LIMPIEZA</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fmtFechaCorta(limpieza.fechaAtencion)}</div>
          </div>
        </div>
      </div>
      <div style={{ background: '#fff', color: '#262319', padding: 20 }}>
        <div style={{ fontSize: 10, color: '#6b6555' }}>JOYERÍA</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>OROEXPRESS {(limpieza.sucursal || '').toUpperCase()}</div>
        <div style={{ fontSize: 10, color: '#6b6555' }}>CLIENTE</div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: limpieza.observacion ? 10 : 0 }}>{limpieza.esClienteNuevo ? 'Nuevo' : 'Ya era cliente'}</div>
        {limpieza.observacion && (
          <>
            <div style={{ fontSize: 10, color: '#6b6555' }}>OBSERVACIONES</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{limpieza.observacion}</div>
          </>
        )}
      </div>
      <div style={{ background: '#c7a339', color: '#1a1200', textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '10px 0' }}>
        Gracias por confiar en Oroexpress
      </div>
    </div>
  );
}

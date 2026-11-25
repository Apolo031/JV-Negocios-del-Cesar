// Dirección, ciudad y coordenadas aproximadas (a nivel de ciudad, no de
// predio exacto) de cada sucursal ya abierta — para "Usar mi ubicación" en
// la landing de Mantenimiento gratis (/limpieza) y para mostrarle al
// cliente cuál joyería le queda más cerca.
export const SUCURSAL_INFO = {
  'Barranquilla': { direccion: 'Calle 38 # 41 - 79', ciudad: 'Barranquilla', lat: 10.9878, lng: -74.7889 },
  'Caucasia': { direccion: 'Calle 19 # 2 - 20, barrio Centro', ciudad: 'Caucasia', lat: 7.9827, lng: -75.1983 },
  'Euro': { direccion: 'Cra 51 N.° 50A - 28', ciudad: 'Copacabana', lat: 6.3489, lng: -75.5108 },
  'Heroica': { direccion: 'Carrera 10 # 35-15, edificio Rumie', ciudad: 'Cartagena', lat: 10.3910, lng: -75.4794 },
  'Sinú': { direccion: 'Calle 34 # 1-45, barrio Centro', ciudad: 'Montería', lat: 8.7479, lng: -75.8814 },
  'La Quinta': { direccion: 'Calle 5 # 12-69, local 1, El Centro', ciudad: 'Aguachica', lat: 8.3090, lng: -73.6217 },
  'Metro': { direccion: 'Calle 45 # 1H-114', ciudad: 'Barranquilla', lat: 10.9878, lng: -74.7889 },
};

/** Distancia en km entre dos puntos (lat/lng en grados) — fórmula de Haversine. */
export function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

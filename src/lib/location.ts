/**
 * Ubicación del usuario, como criterio de ordenamiento.
 *
 * Vive en una cookie y no en el estado del cliente por una razón concreta: la
 * vista de carta y el plan de surtido se calculan en el SERVIDOR. Si la
 * ubicación sólo existiera en el navegador, habría que reordenar después de
 * hidratar —con parpadeo— y el plan, que se arma en el servidor, jamás podría
 * tomarla en cuenta.
 *
 * Se guarda redondeada a dos decimales (~1 km). Las coordenadas de las tiendas
 * son el centro de su ciudad, así que más precisión no mejora nada y sí sería
 * recolectar ubicación fina sin necesitarla.
 */

export const LOCATION_COOKIE = "tcgpool_ubicacion";

export interface UserLocation {
  /** Ciudad elegida a mano, si la hubo. */
  city?: string;
  lat: number;
  lng: number;
  /** 'city' = la eligió de la lista; 'gps' = la compartió el navegador. */
  source: "city" | "gps";
}

/** Ciudades con tienda. Es la lista que se le ofrece al usuario. */
export const CITIES: ReadonlyArray<{ name: string; lat: number; lng: number }> = [
  { name: "CDMX", lat: 19.4326, lng: -99.1332 },
  { name: "Guadalajara", lat: 20.6597, lng: -103.3496 },
  { name: "Monterrey", lat: 25.6866, lng: -100.3161 },
  { name: "Puebla", lat: 19.0414, lng: -98.2063 },
  { name: "Querétaro", lat: 20.5888, lng: -100.3899 },
  { name: "Tijuana", lat: 32.5149, lng: -117.0382 },
  { name: "Mérida", lat: 20.9674, lng: -89.5926 },
];

const coarse = (n: number) => Math.round(n * 100) / 100;

export function serializeLocation(loc: UserLocation): string {
  return JSON.stringify({ ...loc, lat: coarse(loc.lat), lng: coarse(loc.lng) });
}

export function parseLocation(raw: string | undefined): UserLocation | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<UserLocation>;
    if (typeof v.lat !== "number" || typeof v.lng !== "number") return null;
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) return null;
    return {
      city: typeof v.city === "string" ? v.city.slice(0, 40) : undefined,
      lat: coarse(v.lat),
      lng: coarse(v.lng),
      source: v.source === "gps" ? "gps" : "city",
    };
  } catch {
    return null;
  }
}

/** Distancia en km (haversine). */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  if (km < 1) return "menos de 1 km";
  if (km < 100) return `${Math.round(km)} km`;
  return `${Math.round(km / 10) * 10} km`;
}

/**
 * Qué tan buena es una tienda por cercanía. Menor es mejor.
 *
 * La misma ciudad vale más que los kilómetros en línea recta: es la única
 * diferencia que el comprador realmente siente —puede recoger en tienda, o el
 * envío llega al día siguiente— mientras que entre dos ciudades distintas todo
 * es paquetería y 300 km o 600 km dan casi lo mismo.
 */
export function proximityRank(
  loc: UserLocation | null,
  store: { city: string | null; lat: number | null; lng: number | null },
): number {
  if (!loc) return 0;
  const sameCity =
    loc.city && store.city && loc.city.toLowerCase() === store.city.toLowerCase();
  if (sameCity) return 0;
  if (store.lat == null || store.lng == null) return Number.MAX_SAFE_INTEGER;
  const km = distanceKm(loc, { lat: store.lat, lng: store.lng });
  return km < 25 ? 0 : km;
}

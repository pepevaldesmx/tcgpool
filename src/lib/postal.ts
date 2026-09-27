import { CITIES } from "@/lib/location";

/**
 * Código postal mexicano → ciudad.
 *
 * A CIUDAD y no más fino, a propósito: las coordenadas de las tiendas son el
 * centro de su ciudad, así que resolver el CP a la colonia exacta no mejoraría
 * ni un orden ni un cálculo, y sería pedir —y guardar— ubicación más precisa de
 * la que el producto usa. El día que las tiendas tengan dirección real, esto se
 * cambia por un geocodificador de verdad y el resto de la app no se entera.
 *
 * Sólo se mapean los prefijos de las ciudades que están en la lista `CITIES`.
 * Un CP que no reconocemos NO se adivina: se dice, igual que un nombre de carta
 * que el catálogo no conoce.
 */

/** Los dos primeros dígitos del CP identifican la zona postal. */
const PREFIJOS: ReadonlyArray<{ desde: number; hasta: number; ciudad: string }> = [
  // La Ciudad de México ocupa del 01 al 16 completo, una alcaldía por bloque.
  { desde: 1, hasta: 16, ciudad: "CDMX" },
  { desde: 22, hasta: 22, ciudad: "Tijuana" },
  { desde: 44, hasta: 45, ciudad: "Guadalajara" },
  { desde: 64, hasta: 67, ciudad: "Monterrey" },
  { desde: 72, hasta: 72, ciudad: "Puebla" },
  { desde: 76, hasta: 76, ciudad: "Querétaro" },
  { desde: 97, hasta: 97, ciudad: "Mérida" },
];

export interface CiudadPostal {
  city: string;
  lat: number;
  lng: number;
}

export function esCodigoPostal(texto: string): boolean {
  return /^\d{5}$/.test(texto.trim());
}

/** La ciudad de ese CP, o null si no la conocemos. */
export function ciudadDeCodigoPostal(texto: string): CiudadPostal | null {
  const cp = texto.trim();
  if (!esCodigoPostal(cp)) return null;

  const prefijo = Number.parseInt(cp.slice(0, 2), 10);
  const rango = PREFIJOS.find((r) => prefijo >= r.desde && prefijo <= r.hasta);
  if (!rango) return null;

  const ciudad = CITIES.find((c) => c.name === rango.ciudad);
  return ciudad ? { city: ciudad.name, lat: ciudad.lat, lng: ciudad.lng } : null;
}

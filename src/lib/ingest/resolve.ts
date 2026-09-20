import { normalizeText } from "@/lib/ingest/normalize";

/**
 * Último recurso para reconocer un nombre: quitarle paréntesis del final hasta
 * que el catálogo lo reconozca.
 *
 * Perseguir cada variante con una lista de palabras es una carrera que se
 * pierde: las tiendas escriben "(Pro Tour)", "(Promo Pack)", "(Oversized)",
 * "(Gold-Stamped Signature)" y lo que se les ocurra mañana. En vez de adivinar
 * cuáles son tratamientos, se le pregunta al catálogo —que sabe qué cartas
 * existen— si alguna de las versiones recortadas es una carta de verdad.
 *
 * Se prueba de la más larga a la más corta: "Erase (Not the Urza's Legacy One)"
 * ES una carta, y recortarla de más la convertiría en otra.
 */
export function resolveAgainstCatalog(
  name: string,
  conoce: (matchKey: string) => boolean,
): string | null {
  const candidatos: string[] = [];
  let actual = name.trim();
  candidatos.push(actual);

  for (;;) {
    const paren = actual.match(/\s*\([^)]*\)\s*$/);
    if (!paren) break;
    actual = actual.slice(0, paren.index).trim();
    if (!actual) break;
    candidatos.push(actual);
  }

  for (const c of candidatos) {
    if (conoce(normalizeText(c))) return c;
  }
  return null;
}

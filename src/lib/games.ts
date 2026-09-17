import type { GameId } from "@/lib/types";

/**
 * Juegos que el catálogo ACEPTA hoy. Sólo Magic: primero probamos el sistema
 * entero —ingesta, normalización, búsqueda, plan de surtido— con un juego que
 * tiene catálogo canónico (Scryfall) contra el cual resolver nombres.
 *
 * Los demás se DETECTAN igual (ver GAME_PATTERNS) y por eso se pueden descartar
 * limpiamente: detectar no es lo mismo que aceptar, y sin la detección el
 * Digimon de una tienda de Magic entraría como Magic. Sumar un juego es moverlo
 * de FUTUROS a aquí y volver a sincronizar.
 */
export const GAMES: ReadonlyArray<{ id: GameId; name: string }> = [
  { id: "magic", name: "Magic: The Gathering" },
];

/** Detectados y descartados por ahora. Ninguno tiene un Scryfall equivalente. */
export const FUTURE_GAMES: ReadonlyArray<{ id: GameId; name: string }> = [
  { id: "pokemon", name: "Pokémon TCG" },
  { id: "yugioh", name: "Yu-Gi-Oh!" },
  { id: "onepiece", name: "One Piece Card Game" },
  { id: "lorcana", name: "Disney Lorcana" },
  { id: "fleshandblood", name: "Flesh and Blood" },
  { id: "digimon", name: "Digimon Card Game" },
  { id: "gundam", name: "Gundam Card Game" },
];

const ENABLED = new Set<GameId>(GAMES.map((g) => g.id));

export function isEnabledGame(game: GameId): boolean {
  return ENABLED.has(game);
}

/**
 * Detecta el juego desde el `product_type` de la tienda. Las tiendas reales lo
 * escriben como "<Juego> Single" / "<Juego> Sealed", que es la señal más
 * confiable que hay: mucho mejor que adivinar por el título.
 */
const GAME_PATTERNS: Array<[RegExp, GameId]> = [
  [/\b(mtg|magic)\b/, "magic"],
  [/\bpokemon\b/, "pokemon"],
  [/\b(yugioh|yu gi oh|ygo)\b/, "yugioh"],
  [/\bone piece\b/, "onepiece"],
  [/\blorcana\b/, "lorcana"],
  [/\b(flesh and blood|fab)\b/, "fleshandblood"],
  [/\bdigimon\b/, "digimon"],
  [/\bgundam\b/, "gundam"],
];

/**
 * Las tiendas nombran el juego así: "<Juego> Single", "<Juego> Sealed". Si el
 * producto usa esa forma pero el juego no es ninguno de los de arriba, la
 * tienda vende algo que todavía no soportamos — y meterlo al catálogo del
 * `defaultGame` de la tienda es exactamente cómo el Digimon de una tienda de
 * Magic termina catalogado como Magic.
 */
const GAME_PREFIXED_KIND_RE = /^(.+?)\s+(singles?|sealed|accessor\w*|supplies)$/;

export function namesUnsupportedGame(productType: string | undefined): boolean {
  if (!productType) return false;
  const haystack = productType
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return GAME_PREFIXED_KIND_RE.test(haystack) && detectGame(productType) === null;
}

export function detectGame(...parts: Array<string | undefined>): GameId | null {
  const haystack = parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  for (const [re, game] of GAME_PATTERNS) {
    if (re.test(haystack)) return game;
  }
  return null;
}

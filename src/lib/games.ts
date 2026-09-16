import type { GameId } from "@/lib/types";

/** Catálogo de juegos. Un juego existe aquí aunque todavía no tenga listings. */
export const GAMES: ReadonlyArray<{ id: GameId; name: string }> = [
  { id: "magic", name: "Magic: The Gathering" },
  { id: "pokemon", name: "Pokémon TCG" },
  { id: "yugioh", name: "Yu-Gi-Oh!" },
  { id: "onepiece", name: "One Piece Card Game" },
  { id: "lorcana", name: "Disney Lorcana" },
  { id: "fleshandblood", name: "Flesh and Blood" },
];

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
];

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

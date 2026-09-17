import { detectGame, isEnabledGame, namesUnsupportedGame } from "@/lib/games";
import type { Condition, Finish, GameId, RawListing } from "@/lib/types";

/** minúsculas, sin acentos, sin puntuación, espacios colapsados */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’´`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugify(input: string): string {
  return normalizeText(input).replace(/\s+/g, "-");
}

// ---------------------------------------------------------------------------
// Condición
// ---------------------------------------------------------------------------

// Orden de evaluación, NO de calidad: gana el primer patrón que hace match.
// Los términos ambiguos van al final — "muy jugada" contiene "jugada", así que
// HP tiene que evaluarse antes que MP o toda carta muy jugada saldría como MP.
const CONDITION_PATTERNS: Array<[RegExp, Condition]> = [
  [/\b(nm|near\s*mint|mint|casi\s*nueva|nuevo)\b/, "NM"],
  [/\b(lp|lightly\s*played|slightly\s*played|sp|excellent|poco\s*jugada)\b/, "LP"],
  [/\b(hp|heavily\s*played|poor|muy\s*jugada)\b/, "HP"],
  [/\b(dmg|damaged|danada)\b/, "DMG"],
  [/\b(mp|moderately\s*played|good|jugada)\b/, "MP"],
];

export function detectCondition(...parts: Array<string | undefined>): Condition {
  const haystack = normalizeText(parts.filter(Boolean).join(" "));
  for (const [re, condition] of CONDITION_PATTERNS) {
    if (re.test(haystack)) return condition;
  }
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Acabado (foil / no foil)
// ---------------------------------------------------------------------------

export function detectFinish(...parts: Array<string | undefined>): Finish {
  const haystack = normalizeText(parts.filter(Boolean).join(" "));
  if (/\betched\b/.test(haystack)) return "etched";
  if (/\bnon\s*foil\b|\bno\s*foil\b|\bnormal\b/.test(haystack)) return "nonfoil";
  if (/\bfoil\b|\bholo(foil|grafica)?\b|\bpremium\b/.test(haystack)) return "foil";
  return "nonfoil";
}

// ---------------------------------------------------------------------------
// Idioma
// ---------------------------------------------------------------------------

// Primero los nombres completos (inequívocos), después los códigos de dos
// letras. Si no, un "carta en español" haría match con el \b(en)\b de inglés.
const LANGUAGE_WORDS: Array<[RegExp, string]> = [
  [/\b(english|ingles)\b/, "en"],
  [/\b(spanish|espanol|castellano)\b/, "es"],
  [/\b(japanese|japones)\b/, "ja"],
  [/\b(portuguese|portugues)\b/, "pt"],
  [/\b(french|frances)\b/, "fr"],
  [/\b(german|aleman)\b/, "de"],
  [/\b(italian|italiano)\b/, "it"],
  [/\b(chinese|chino)\b/, "zh"],
  [/\b(korean|coreano)\b/, "ko"],
];

const LANGUAGE_CODES: Array<[RegExp, string]> = [
  [/\b(eng|en)\b/, "en"],
  [/\b(esp|es|sp)\b/, "es"],
  [/\b(jpn|jp|ja)\b/, "ja"],
  [/\b(pt|por)\b/, "pt"],
  [/\b(fr|fra)\b/, "fr"],
  [/\b(de|deu)\b/, "de"],
  [/\b(it|ita)\b/, "it"],
  [/\b(zhs|zht|cn)\b/, "zh"],
  [/\b(kr|ko)\b/, "ko"],
];

export function detectLanguage(...parts: Array<string | undefined>): string {
  const haystack = normalizeText(parts.filter(Boolean).join(" "));
  for (const [re, lang] of LANGUAGE_WORDS) {
    if (re.test(haystack)) return lang;
  }
  for (const [re, lang] of LANGUAGE_CODES) {
    if (re.test(haystack)) return lang;
  }
  return "en"; // default de facto en las tiendas mexicanas
}

// ---------------------------------------------------------------------------
// Nombre de carta + set
// ---------------------------------------------------------------------------

/** Sufijos de variante que van pegados al nombre y no son parte del nombre. */
const NAME_NOISE =
  /\s*[\(\[]\s*(foil|non[-\s]?foil|etched|showcase|extended art|borderless|retro|prerelease|promo|jp|japanese|japones|ingles|english|espanol|spanish|v\.?\d+|version \d+)\s*[\)\]]/gi;

/**
 * Tratamientos y acabados que las tiendas ponen entre paréntesis. NO son parte
 * del nombre de la carta: "Command Tower (Surge Foil)" es Command Tower. Lo que
 * distingue una impresión de otra es el set y el número de colección, no esto.
 */
const TREATMENT =
  /^(foil|non[-\s]?foil|etched|surge\s*foil|rainbow\s*foil|double\s*rainbow|galaxy\s*foil|textured\s*foil|halo\s*foil|confetti\s*foil|raised\s*foil|gilded\s*foil|neon\s*ink|oil\s*slick|step[-\s]?and[-\s]?compleat|serial(ized)?|showcase|extended\s*art|borderless|full\s*art|alternate\s*art|retro(\s*frame)?|prerelease|promo|foil\s*etched|jp|japanese|japones|ingles|english|espanol|spanish|v\.?\d+|version\s*\d+)$/i;

/** "(0233)", "#123", "(0917)": el número de colección, no un nombre de set. */
const COLLECTOR = /^#?\d{1,5}[a-z★†]?$/i;

/** "(DSC)", "(LTC)": código de set abreviado que las tiendas anexan. */
const SET_CODE = /^[A-Z0-9]{2,5}$/;

export interface ParsedTitle {
  cardName: string;
  setName?: string;
  /** Número de colección, si el título lo traía. */
  collectorNumber?: string;
}

/**
 * Extrae nombre de carta y set de un título de producto de tienda.
 *
 * Formatos que cubrimos (los tres que aparecen en las tiendas MX que vimos):
 *   "Lightning Bolt [Ravnica: City of Guilds]"
 *   "Lightning Bolt (Modern Horizons 2)"
 *   "Lightning Bolt - Ravnica: City of Guilds"
 */
export function parseTitle(rawTitle: string): ParsedTitle {
  let title = rawTitle.replace(/\s+/g, " ").trim();
  let setName: string | undefined;
  let collectorNumber: string | undefined;

  const bracket = title.match(/\[([^\]]+)\]\s*$/);
  if (bracket) {
    setName = bracket[1].trim();
    title = title.slice(0, bracket.index).trim();
  }

  // Los paréntesis del final se pelan uno por uno, de derecha a izquierda:
  // "Command Tower (0233) (Surge Foil)" trae dos, y dejar cualquiera de ellos
  // pegado al nombre convierte una carta en seis cartas distintas — que es
  // exactamente lo que pasaba, y rompe el cruce entre tiendas.
  for (;;) {
    const paren = title.match(/\(([^)]+)\)\s*$/);
    if (!paren) break;
    const inner = paren[1].trim();

    if (COLLECTOR.test(inner)) collectorNumber ??= inner.replace(/^#/, "");
    else if (TREATMENT.test(inner)) void 0;
    else if (setName && SET_CODE.test(inner)) void 0;
    else break; // Es el nombre del set, o algo que no sabemos leer: se queda.

    title = title.slice(0, paren.index).trim();
  }

  if (!setName) {
    const paren = title.match(/\(([^)]+)\)\s*$/);
    if (paren) {
      setName = paren[1].trim();
      title = title.slice(0, paren.index).trim();
    } else {
      const dash = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
      if (dash) {
        title = dash[1].trim();
        setName = dash[2].trim();
      }
    }
  }

  const cardName = title.replace(NAME_NOISE, "").replace(/\s+/g, " ").trim();
  return {
    cardName,
    setName: setName?.replace(NAME_NOISE, "").trim() || undefined,
    // Sin número, la llave ni siquiera aparece: un `undefined` explícito
    // ensucia las comparaciones de quien use esto.
    ...(collectorNumber ? { collectorNumber } : {}),
  };
}

// ---------------------------------------------------------------------------
// Filtro: ¿esto es una carta suelta (single) o es sellado/accesorio?
// ---------------------------------------------------------------------------

const NON_SINGLE = [
  "booster",
  "box",
  "caja",
  "bundle",
  "display",
  "sobre",
  "sobres",
  "sleeve",
  "sleeves",
  "protector",
  "protectores",
  "micas",
  "playmat",
  "tapete",
  "deck box",
  "portafolio",
  "binder",
  "dado",
  "dados",
  "dice",
  "counter",
  "counters",
  "contador",
  "contadores",
  "preventa",
  "gift card",
  "tarjeta de regalo",
  "bulk",
  "lote",
  "coleccion completa",
  "starter kit",
  "commander deck",
  "precon",
];

/**
 * Los términos de ruido se comparan como PALABRA COMPLETA, no como subcadena.
 * Con `includes` sencillo, "counter" (pensado para los dice counters) se comía
 * Counterspell, y "box" se comería cualquier carta con esa sílaba.
 */
const NON_SINGLE_RE = new RegExp(
  `\\b(?:${NON_SINGLE.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
);

/** Qué clase de producto es. `product_type` manda sobre el título. */
export type ProductKind = "single" | "sealed" | "accessory" | "unknown";

const KIND_PATTERNS: Array<[RegExp, ProductKind]> = [
  [/\b(single|singles|carta suelta|cartas sueltas)\b/, "single"],
  [/\b(sealed|sellado|producto sellado|preventa)\b/, "sealed"],
  [/\b(accesorio|accesorios|accessories|supplies)\b/, "accessory"],
];

export interface Classification {
  game: GameId | null;
  kind: ProductKind;
}

/**
 * Clasifica un producto por juego y tipo.
 *
 * Las tiendas reales etiquetan `product_type` como "<Juego> Single" o
 * "<Juego> Sealed", que es la señal más confiable que existe. Sin ella caemos al
 * título y a los tags, que es adivinar.
 *
 * Importante: sin esto, una tienda que vende varios juegos mete su Yu-Gi-Oh y su
 * Pokémon al catálogo de Magic.
 */
export function classifyProduct(listing: RawListing): Classification {
  const type = listing.productType ?? "";
  const tags = (listing.tags ?? []).join(" ");

  const game = detectGame(type) ?? detectGame(tags);

  const typeHaystack = normalizeText(type);
  for (const [re, kind] of KIND_PATTERNS) {
    if (re.test(typeHaystack)) return { game, kind };
  }

  // Sin `product_type` útil: el título decide, con la lista de ruido.
  const titleHaystack = normalizeText([listing.title, tags].join(" "));
  if (NON_SINGLE_RE.test(titleHaystack)) return { game, kind: "sealed" };
  return { game, kind: "unknown" };
}

export function looksLikeSingle(listing: RawListing): boolean {
  const { kind } = classifyProduct(listing);
  if (kind === "sealed" || kind === "accessory") return false;
  // Un single sin nombre parseable no sirve para el buscador.
  return parseTitle(listing.title).cardName.length > 1;
}

// ---------------------------------------------------------------------------
// Resultado normalizado
// ---------------------------------------------------------------------------

export interface NormalizedListing {
  game: GameId;
  cardName: string;
  cardMatchKey: string;
  setName?: string;
  collectorNumber?: string;
  language: string;
  finish: Finish;
  condition: Condition;
  priceCents: number;
  stock: number;
  inStock: boolean;
  productUrl: string;
  imageUrl?: string;
  rawTitle: string;
  externalId: string;
}

export function normalizeListing(
  raw: RawListing,
  defaultGame: GameId = "magic",
): NormalizedListing | null {
  const { game, kind } = classifyProduct(raw);
  if (kind === "sealed" || kind === "accessory") return null;
  // El `defaultGame` de la tienda es el respaldo para productos que no nombran
  // juego ("Cartas Sueltas"), NO para los que nombran uno que no soportamos.
  if (!game && namesUnsupportedGame(raw.productType)) return null;
  if (!Number.isFinite(raw.priceMxn) || raw.priceMxn <= 0) return null;

  // El juego se decide ANTES de mirar el título: un producto de un juego que
  // todavía no aceptamos se descarta entero, no se intenta parsear.
  const resolved = game ?? defaultGame;
  if (!isEnabledGame(resolved)) return null;

  const { cardName, setName, collectorNumber } = parseTitle(raw.title);
  if (cardName.length < 2) return null;

  const variantAndTags = [raw.variantTitle, (raw.tags ?? []).join(" ")].join(" ");
  const stock = raw.stock ?? (raw.available ? 1 : 0);

  return {
    game: resolved,
    cardName,
    cardMatchKey: normalizeText(cardName),
    setName,
    collectorNumber,
    language: detectLanguage(variantAndTags, raw.title),
    finish: detectFinish(variantAndTags, raw.title),
    condition: detectCondition(variantAndTags),
    priceCents: Math.round(raw.priceMxn * 100),
    stock,
    inStock: raw.available && stock > 0,
    productUrl: raw.productUrl,
    imageUrl: raw.imageUrl,
    rawTitle: [raw.title, raw.variantTitle].filter(Boolean).join(" — "),
    externalId: raw.externalId,
  };
}

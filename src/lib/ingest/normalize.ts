import type { Condition, Finish, RawListing } from "@/lib/types";

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

export interface ParsedTitle {
  cardName: string;
  setName?: string;
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

  const bracket = title.match(/\[([^\]]+)\]\s*$/);
  if (bracket) {
    setName = bracket[1].trim();
    title = title.slice(0, bracket.index).trim();
  } else {
    const paren = title.match(/\(([^)]+)\)\s*$/);
    if (paren && !/^(foil|non[-\s]?foil|etched)$/i.test(paren[1].trim())) {
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
  return { cardName, setName: setName?.replace(NAME_NOISE, "").trim() || undefined };
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
  "sleeve",
  "protector",
  "micas",
  "playmat",
  "tapete",
  "deck box",
  "portafolio",
  "binder",
  "dado",
  "dice",
  "counter",
  "contador",
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

export function looksLikeSingle(listing: RawListing): boolean {
  const haystack = normalizeText(
    [listing.title, listing.productType, (listing.tags ?? []).join(" ")].join(" "),
  );
  if (NON_SINGLE.some((needle) => haystack.includes(needle))) return false;
  // Un single sin nombre parseable no sirve para el buscador.
  return parseTitle(listing.title).cardName.length > 1;
}

// ---------------------------------------------------------------------------
// Resultado normalizado
// ---------------------------------------------------------------------------

export interface NormalizedListing {
  cardName: string;
  cardMatchKey: string;
  setName?: string;
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

export function normalizeListing(raw: RawListing): NormalizedListing | null {
  if (!looksLikeSingle(raw)) return null;
  if (!Number.isFinite(raw.priceMxn) || raw.priceMxn <= 0) return null;

  const { cardName, setName } = parseTitle(raw.title);
  if (!cardName) return null;

  const variantAndTags = [raw.variantTitle, (raw.tags ?? []).join(" ")].join(" ");
  const stock = raw.stock ?? (raw.available ? 1 : 0);

  return {
    cardName,
    cardMatchKey: normalizeText(cardName),
    setName,
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

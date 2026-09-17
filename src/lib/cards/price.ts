/**
 * Precio de referencia de una impresión.
 *
 * De dónde sale: Scryfall republica bajo licencia los precios de TCGplayer
 * —la misma referencia que las tiendas mexicanas usan para fijar los suyos— por
 * impresión concreta. Scrapear TCGplayer o StarCityGames daría el mismo número
 * violando sus términos, y construir la plataforma sobre un acceso que pueden
 * cortar en cualquier momento es peor negocio que pedirlo por la vía buena.
 *
 * El precio que devolvemos es una SUGERENCIA, no un precio de venta: el tipo de
 * cambio se muestra siempre para que la tienda vea la aritmética y la corrija.
 */
import type { PrintingForPricing } from "@/lib/db/queries";

const API = "https://api.scryfall.com";
const USER_AGENT = "tcgpool/0.1 (comparador de cartas TCG MX; contacto: hola@tcgpool.mx)";

/**
 * Pesos por dólar. NO es sólo el tipo de cambio: las tiendas mexicanas venden
 * arriba del precio de TCGplayer —importación, aduana, margen— y lo medido
 * contra su catálogo real ronda 20–21 pesos por dólar de referencia. Se
 * configura por entorno porque va a envejecer.
 */
export function mxnPerUsd(): number {
  const raw = Number(process.env.MXN_POR_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

export interface Reference {
  usd: number | null;
  /** Precio sugerido en centavos de peso. */
  suggestedCents: number | null;
  rate: number;
  imageUrl: string | null;
  scryfallUrl: string | null;
  /** Qué tan seguro es el empate con la impresión que capturó la tienda. */
  match: "exacta" | "por-set" | "por-nombre" | "ninguna";
}

interface ScryfallCard {
  id: string;
  name: string;
  scryfall_uri?: string;
  image_uris?: { normal?: string; small?: string };
  card_faces?: Array<{ image_uris?: { normal?: string; small?: string } }>;
  prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null };
}

let lastCall = 0;
async function get(url: string): Promise<ScryfallCard | null> {
  // Scryfall pide 50–100 ms entre llamadas.
  const wait = Math.max(0, 150 - (Date.now() - lastCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ScryfallCard;
  } catch {
    return null;
  }
}

function imageOf(card: ScryfallCard): string | null {
  return card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null;
}

/** El precio del acabado que la tienda eligió, no el de la carta "en general". */
function priceFor(card: ScryfallCard, finish: string): number | null {
  const p = card.prices ?? {};
  const raw =
    finish === "foil" ? p.usd_foil : finish === "etched" ? (p.usd_etched ?? p.usd_foil) : p.usd;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Una impresión no cambia de precio entre dos capturas seguidas, y la tienda va
// a pasearse por la misma carta varias veces mientras decide.
const cache = new Map<number, { at: number; ref: Reference }>();
const TTL_MS = 30 * 60 * 1000;

export async function referencePrice(printing: PrintingForPricing): Promise<Reference> {
  const hit = cache.get(printing.id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ref;

  let card: ScryfallCard | null = null;
  let match: Reference["match"] = "ninguna";

  // De lo más específico a lo más laxo: el número de colección identifica la
  // impresión sin ambigüedad; el nombre solo puede caer en otra edición con
  // otro precio, y eso hay que decirlo.
  if (printing.setCode && printing.collectorNumber) {
    card = await get(`${API}/cards/${printing.setCode}/${encodeURIComponent(printing.collectorNumber)}`);
    if (card) match = "exacta";
  }
  if (!card && printing.setCode) {
    card = await get(
      `${API}/cards/named?exact=${encodeURIComponent(printing.cardName)}&set=${printing.setCode}`,
    );
    if (card) match = "por-set";
  }
  if (!card) {
    card = await get(`${API}/cards/named?exact=${encodeURIComponent(printing.cardName)}`);
    if (card) match = "por-nombre";
  }

  const rate = mxnPerUsd();
  const usd = card ? priceFor(card, printing.finish) : null;
  const ref: Reference = {
    usd,
    suggestedCents: usd == null ? null : Math.round(usd * rate * 100),
    rate,
    imageUrl: printing.imageUrl ?? (card ? imageOf(card) : null),
    scryfallUrl: card?.scryfall_uri ?? null,
    match,
  };
  cache.set(printing.id, { at: Date.now(), ref });
  return ref;
}

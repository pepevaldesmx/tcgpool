import fs from "node:fs";
import path from "node:path";

/**
 * Enriquecimiento de cartas de Magic contra Scryfall (catálogo canónico y
 * gratuito). Nos da el nombre correcto, la imagen y el set — con eso el
 * buscador agrupa listings de tiendas distintas bajo la misma carta aunque
 * cada tienda escriba el título a su manera.
 *
 * Para Pokémon / Yu-Gi-Oh habría que meter otra fuente; el resto del pipeline
 * no cambia porque todos pasan por `resolveCard`.
 */

// Dos cachés, a propósito:
//  - `named`: chico y versionado en el repo, para que `npm run build` resuelva
//    nombres canónicos sin red (Vercel builds deterministas).
//  - `search`: grande (impresiones completas) y sólo lo usan los scripts de
//    datos, así que va en .gitignore.
const NAMED_CACHE_FILE = path.join(process.cwd(), "data", "scryfall-cache.json");
const SEARCH_CACHE_FILE = path.join(process.cwd(), "data", "scryfall-search-cache.json");
const API = "https://api.scryfall.com";
const USER_AGENT = "tcgpool/0.1 (comparador TCG MX)";

export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  lang: string;
  set: string;
  set_name: string;
  collector_number: string;
  type_line?: string;
  image_uris?: { normal?: string; small?: string; art_crop?: string };
  card_faces?: Array<{ image_uris?: { normal?: string; small?: string } }>;
  finishes?: string[];
  prices?: Record<string, string | null>;
  scryfall_uri?: string;
}

type NamedCache = Record<string, ScryfallCard | null>;
type SearchCache = Record<string, ScryfallCard[]>;

let namedCache: NamedCache | null = null;
let searchCache: SearchCache | null = null;

function readJson<T>(file: string, fallback: T): T {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : fallback;
}

function loadNamed(): NamedCache {
  namedCache ??= readJson<NamedCache>(NAMED_CACHE_FILE, {});
  return namedCache;
}

function loadSearch(): SearchCache {
  searchCache ??= readJson<SearchCache>(SEARCH_CACHE_FILE, {});
  return searchCache;
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

/** Persiste la caché de nombres. Llamar al final de cada sync. */
export function saveCache() {
  if (namedCache) writeJson(NAMED_CACHE_FILE, namedCache);
}

export function cardImage(card: ScryfallCard): string | undefined {
  return card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal;
}

let lastCall = 0;
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  // Scryfall pide 50–100 ms entre llamadas. Somos buenos ciudadanos.
  const wait = Math.max(0, 150 - (Date.now() - lastCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  return fn();
}

async function namedRequest(query: string): Promise<ScryfallCard | null> {
  const res = await throttled(() =>
    fetch(`${API}/cards/named?${query}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    }),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Scryfall HTTP ${res.status}`);
  return (await res.json()) as ScryfallCard;
}

/**
 * Resuelve un nombre de carta (posiblemente mal escrito por la tienda) contra
 * Scryfall. Cachea en disco, incluidos los fallos, para no repegarle a la API
 * en cada sync.
 */
export async function lookupCardByName(
  name: string,
  opts: { offline?: boolean } = {},
): Promise<ScryfallCard | null> {
  const key = name.toLowerCase();
  const c = loadNamed();
  if (key in c) return c[key];
  if (opts.offline) return null;

  try {
    // `exact` primero: con `fuzzy`, "Swords to Plowshares" cae en cartas
    // partidas del estilo "Emeritus of Truce // Swords to Plowshares" y
    // acabaríamos renombrando la carta de la tienda. `fuzzy` queda de red de
    // seguridad para títulos con typos o acentos raros.
    let card = await namedRequest(`exact=${encodeURIComponent(name)}`);
    if (!card) card = await namedRequest(`fuzzy=${encodeURIComponent(name)}`);
    c[key] = card;
    return card;
  } catch {
    // Sin red (o Scryfall caído) la ingesta sigue: la carta queda sin imagen
    // ni set canónico, pero el listing entra igual.
    return null;
  }
}

/** Búsqueda cruda en Scryfall (usada por los scripts de datos, no por la app). */
export async function searchCards(query: string): Promise<ScryfallCard[]> {
  const url = `${API}/cards/search?q=${encodeURIComponent(query)}&unique=prints`;
  const c = loadSearch();
  const hit = c[query];
  // Sólo cacheamos búsquedas con resultado: un 429 no debe quedar grabado
  // como "esta carta no existe".
  if (hit?.length) return hit;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await throttled(() =>
      fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }),
    );
    if (res.ok) {
      const body = (await res.json()) as { data?: ScryfallCard[] };
      const data = body.data ?? [];
      if (data.length) {
        c[query] = data;
        writeJson(SEARCH_CACHE_FILE, c);
      }
      return data;
    }
    // 404 = la búsqueda no encontró nada; reintentar no cambia el resultado.
    if (res.status === 404) return [];
    // 429 / 5xx: backoff. Scryfall tira 429 si le pegamos muy seguido.
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  return [];
}

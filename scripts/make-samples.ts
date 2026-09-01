/**
 * Genera los feeds de muestra (data/snapshots/*.sample.json) que alimentan la
 * demo cuando no hay acceso a los feeds reales de las tiendas.
 *
 *  - Las CARTAS son reales: nombres, sets, números de colección e imágenes se
 *    bajan de Scryfall.
 *  - Los PRECIOS, CONDICIONES y STOCK son sintéticos y están marcados como
 *    tales (`"_sample": true` en cada archivo, y la UI lo advierte).
 *  - Cada tienda escribe los títulos con un estilo distinto a propósito: así
 *    la demo prueba de verdad el normalizador, que es la pieza difícil.
 *
 * Uso:  npm run make-samples
 * Reemplazar por datos reales:  npm run sync -- --live
 */
import fs from "node:fs";
import path from "node:path";
import { searchCards, type ScryfallCard } from "../src/lib/cards/scryfall";

const USD_TO_MXN = 21.5;

/** Staples que cualquier LGS mexicano tiene en vitrina. */
const HERO_CARDS = [
  "Sol Ring",
  "Lightning Bolt",
  "Counterspell",
  "Swords to Plowshares",
  "Cyclonic Rift",
  "Arcane Signet",
  "Rhystic Study",
  "Smothering Tithe",
];

const LONG_TAIL = [
  "Birds of Paradise",
  "Path to Exile",
  "Thoughtseize",
  "Fatal Push",
  "Brainstorm",
  "Cultivate",
  "Beast Within",
  "Anguished Unmaking",
  "Teferi's Protection",
  "Dockside Extortionist",
  "Mana Crypt",
  "Craterhoof Behemoth",
  "Heroic Intervention",
  "Blasphemous Act",
  "Toxic Deluge",
  "Eternal Witness",
  "Solemn Simulacrum",
  "Aura Shards",
  "Esper Sentinel",
  "Wrath of God",
  "Ponder",
  "Preordain",
  "Chromatic Lantern",
  "Sensei's Divining Top",
  "Doubling Season",
  "Vampiric Tutor",
  "Demonic Tutor",
  "Sylvan Library",
  "Phyrexian Arena",
  "Deflecting Swat",
];

interface StoreStyle {
  slug: string;
  domain: string;
  /** Cómo escribe el título del producto esta tienda. */
  title: (card: ScryfallCard, foil: boolean) => string;
  /** Cómo escribe el título de la variante. */
  variant: (condition: string, language: string, foil: boolean) => string;
  /** Multiplicador de precio de la tienda (variación real entre LGS). */
  priceFactor: number;
  /** Probabilidad de que la tienda tenga una carta del long tail. */
  coverage: number;
  vendor: string;
}

const CONDITIONS: Array<[string, string, number, number]> = [
  // [código, etiqueta larga, factor de precio, peso]
  ["NM", "Near Mint", 1.0, 6],
  ["LP", "Lightly Played", 0.85, 3],
  ["MP", "Moderately Played", 0.7, 2],
  ["HP", "Heavily Played", 0.55, 1],
];

const STORES: StoreStyle[] = [
  {
    slug: "mtg-mexico",
    domain: "mtgmexico.com",
    vendor: "MTG México",
    priceFactor: 1.0,
    coverage: 0.75,
    title: (c, foil) => `${c.name}${foil ? " (Foil)" : ""} [${c.set_name}]`,
    variant: (cond) => CONDITIONS.find(([code]) => code === cond)![1],
  },
  {
    slug: "yellow-rabbit",
    domain: "yellowrabbit.com.mx",
    vendor: "Yellow Rabbit",
    priceFactor: 1.12,
    coverage: 0.6,
    title: (c) => `${c.name} (${c.set_name})`,
    variant: (cond, lang, foil) =>
      `${cond} - ${lang === "es" ? "Español" : "English"}${foil ? " Foil" : ""}`,
  },
  {
    slug: "tao-games",
    domain: "taogames.mx",
    vendor: "Tao Games",
    priceFactor: 0.93,
    coverage: 0.55,
    title: (c, foil) => `${c.name} - ${c.set_name}${foil ? " - Foil" : ""}`,
    variant: (cond, lang) =>
      `${CONDITIONS.find(([code]) => code === cond)![1]}${lang === "es" ? " Español" : ""}`,
  },
];

/** Ruido: sellado y accesorios que el normalizador debe descartar. */
const NOISE = [
  ["Foundations Play Booster Box", "Sellado"],
  ["Bloomburrow Bundle", "Sellado"],
  ["Micas Dragon Shield Matte Negro (100)", "Accesorios"],
  ["Playmat MTG México", "Accesorios"],
  ["Deck Box Ultra Pro Satin Tower", "Accesorios"],
  ["Commander Deck: Eldrazi Unbound", "Sellado"],
];

// PRNG determinista: mismo seed => mismos archivos, para que los diffs del repo
// sean legibles y la demo sea reproducible.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickWeighted<T>(rand: () => number, entries: Array<[T, number]>): T {
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function basePriceMxn(card: ScryfallCard, foil: boolean): number {
  const usd = Number.parseFloat(
    (foil ? card.prices?.usd_foil : card.prices?.usd) ?? card.prices?.usd ?? "",
  );
  const value = Number.isFinite(usd) && usd > 0 ? usd : 0.5;
  return value * USD_TO_MXN;
}

async function loadPrintings(): Promise<Map<string, ScryfallCard[]>> {
  const names = [...HERO_CARDS, ...LONG_TAIL];
  const byName = new Map<string, ScryfallCard[]>();

  for (const name of names) {
    process.stdout.write(`  Scryfall: ${name}… `);
    const prints = await searchCards(`!"${name}" -is:digital`);
    // `!"Nombre"` también trae cartas partidas donde ese nombre es sólo una
    // cara ("Emeritus of Conflict // Lightning Bolt"). Para la demo queremos la
    // carta tal cual, así que exigimos coincidencia exacta del nombre.
    const exact = prints.filter((p) => p.name === name);
    // Nos quedamos con impresiones en papel con imagen y precio conocido.
    const usable = exact.filter((p) => p.image_uris?.normal && p.prices?.usd).slice(0, 6);
    byName.set(name, usable.length ? usable : exact.slice(0, 2));
    console.log(`${usable.length} impresiones`);
  }
  return byName;
}

function buildShopifyFeed(store: StoreStyle, printings: Map<string, ScryfallCard[]>) {
  const rand = mulberry32(hashSeed(store.slug));
  const products: unknown[] = [];
  let productId = 1000;
  let variantId = 900000;

  for (const [name, prints] of printings) {
    const isHero = HERO_CARDS.includes(name);
    if (!isHero && rand() > store.coverage) continue;
    if (!prints.length) continue;

    // Cuántas impresiones distintas trae esta tienda de esta carta.
    const count = isHero ? 1 + Math.floor(rand() * Math.min(3, prints.length)) : 1;
    const chosen = new Set<number>();
    while (chosen.size < count) chosen.add(Math.floor(rand() * prints.length));

    for (const idx of chosen) {
      const card = prints[idx];
      const foil = rand() < 0.22 && (card.finishes ?? []).includes("foil");
      const variants: unknown[] = [];
      const nVariants = 1 + Math.floor(rand() * 2);

      for (let v = 0; v < nVariants; v++) {
        const cond = pickWeighted(
          rand,
          CONDITIONS.map(([code, , , weight]) => [code, weight] as [string, number]),
        );
        const condFactor = CONDITIONS.find(([code]) => code === cond)![2];
        const language = rand() < 0.15 ? "es" : "en";
        const jitter = 0.85 + rand() * 0.35; // variación real entre tiendas
        const price =
          basePriceMxn(card, foil) *
          store.priceFactor *
          condFactor *
          jitter *
          (foil ? 1.0 : 1.0) *
          (language === "es" ? 0.92 : 1);

        variants.push({
          id: variantId++,
          title: store.variant(cond, language, foil),
          price: Math.max(5, Math.round(price)).toFixed(2),
          available: rand() > 0.12,
          sku: `${store.slug}-${card.set}-${card.collector_number}-${cond}`,
        });
      }

      products.push({
        id: productId++,
        title: store.title(card, foil),
        handle: `${card.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${card.set}`,
        vendor: store.vendor,
        product_type: "Cartas Sueltas",
        tags: ["Magic", card.set_name, foil ? "Foil" : "Non-Foil"],
        variants,
        images: [{ src: card.image_uris!.normal }],
      });
    }
  }

  for (const [title, type] of NOISE) {
    products.push({
      id: productId++,
      title,
      handle: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      vendor: store.vendor,
      product_type: type,
      tags: [type],
      variants: [
        {
          id: variantId++,
          title: "Default Title",
          price: (500 + Math.round(rand() * 4000)).toFixed(2),
          available: true,
        },
      ],
      images: [],
    });
  }

  return {
    _sample: true,
    _nota:
      "Feed de MUESTRA con la forma exacta de /products.json de Shopify. " +
      "Cartas, sets e imágenes son reales (Scryfall); precios, condiciones y " +
      "stock son sintéticos. Reemplazar con `npm run sync -- --live`.",
    _generated_at: new Date().toISOString(),
    products,
  };
}

/** MTG Wolf corre en Wix: no hay feed, se ingiere en el shape del adaptador manual. */
function buildManualFeed(printings: Map<string, ScryfallCard[]>) {
  const rand = mulberry32(hashSeed("mtg-wolf"));
  const listings: unknown[] = [];
  let id = 5000;

  for (const [name, prints] of printings) {
    if (!HERO_CARDS.includes(name) && rand() > 0.35) continue;
    const card = prints[Math.floor(rand() * prints.length)];
    if (!card) continue;
    const cond = pickWeighted(
      rand,
      CONDITIONS.map(([code, , , weight]) => [code, weight] as [string, number]),
    );
    const condFactor = CONDITIONS.find(([code]) => code === cond)![2];
    const price = basePriceMxn(card, false) * 1.05 * condFactor * (0.9 + rand() * 0.3);

    listings.push({
      externalId: `wolf-${id++}`,
      title: `${card.name} [${card.set_name}]`,
      variantTitle: `${cond} / Inglés`,
      productType: "Singles",
      tags: ["Magic"],
      priceMxn: Math.max(5, Math.round(price)),
      available: rand() > 0.15,
      productUrl: `https://mtgwolf.com/product-page/${card.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`,
      imageUrl: card.image_uris?.normal,
    });
  }

  return {
    _sample: true,
    _nota:
      "MTG Wolf corre en Wix y no expone un feed público equivalente a " +
      "/products.json. Estos listings son de MUESTRA, capturados en el shape " +
      "que espera el adaptador manual.",
    _generated_at: new Date().toISOString(),
    listings,
  };
}

async function main() {
  console.log("Bajando impresiones reales de Scryfall…");
  const printings = await loadPrintings();

  const dir = path.join(process.cwd(), "data", "snapshots");
  fs.mkdirSync(dir, { recursive: true });

  for (const store of STORES) {
    const feed = buildShopifyFeed(store, printings);
    const file = path.join(dir, `${store.slug}.sample.json`);
    fs.writeFileSync(file, JSON.stringify(feed, null, 2));
    console.log(`✓ ${file} — ${feed.products.length} productos`);
  }

  const manual = buildManualFeed(printings);
  const manualFile = path.join(dir, "mtg-wolf.manual.json");
  fs.writeFileSync(manualFile, JSON.stringify(manual, null, 2));
  console.log(`✓ ${manualFile} — ${manual.listings.length} listings`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

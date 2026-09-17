import fs from "node:fs";
import path from "node:path";
import type { AdapterResult, RawListing } from "@/lib/types";

/**
 * Shopify expone `/products.json` público en cada tienda (estándar de la
 * plataforma, sin API key ni convenio). Devuelve catálogo, variantes, precios y
 * disponibilidad. Es la vía de arranque para MTG México, Yellow Rabbit y Tao.
 *
 * Limitación conocida: `/products.json` NO trae inventory_quantity, sólo
 * `available`. Guardamos stock 1/0 y lo marcamos como "disponible" en vez de
 * inventar un número.
 */

export interface ShopifyConfig {
  /** Dominio de la tienda, sin protocolo. Ej: "mtgmexico.com" */
  domain: string;
  /** Máximo de páginas a recorrer (250 productos c/u). */
  maxPages?: number;
  /** Sólo ingerir estos product_type (si se define). */
  productTypes?: string[];
}

interface ShopifyVariant {
  id: number | string;
  title: string;
  price: string;
  available: boolean;
  sku?: string | null;
  featured_image?: { src?: string } | null;
}

interface ShopifyProduct {
  id: number | string;
  title: string;
  handle: string;
  vendor?: string;
  product_type?: string;
  tags?: string[] | string;
  variants: ShopifyVariant[];
  images?: Array<{ src?: string }>;
}

export interface ShopifyFeed {
  products: ShopifyProduct[];
  /** La paginación se cortó antes de tiempo. No se guarda en el snapshot. */
  partial?: boolean;
}

const USER_AGENT =
  "tcgpool/0.1 (comparador de cartas TCG MX; contacto: hola@tcgpool.mx)";

function snapshotPath(slug: string, kind: "live" | "sample") {
  return path.join(process.cwd(), "data", "snapshots", `${slug}.${kind}.json`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Una página, con reintentos: un 500 aislado a la mitad no debe tirar la corrida. */
async function fetchPage(url: string, attempts = 3, backoffMs = 1500): Promise<ShopifyProduct[]> {
  let last = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      if (res.ok) return ((await res.json()) as ShopifyFeed).products ?? [];
      last = `HTTP ${res.status}`;
      // 404 y 403 son definitivos: reintentar sólo gasta el tiempo de la tienda.
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      last = (err as Error).message;
    }
    if (attempt < attempts) await sleep(attempt * backoffMs);
  }
  throw new Error(`${last} en ${url}`);
}

/**
 * Recorre /products.json paginado y devuelve el feed crudo.
 *
 * Si una página falla después de los reintentos, devuelve lo que alcanzó a
 * juntar marcado como `partial` en vez de tirar todo: perder 3,500 productos ya
 * descargados porque la página 15 dio un 500 deja a la tienda entera fuera del
 * buscador por un error pasajero.
 */
export async function fetchShopifyFeed(
  config: ShopifyConfig,
  {
    onPage,
    onPartial,
    backoffMs,
  }: {
    onPage?: (page: number, count: number) => void;
    onPartial?: (page: number, reason: string) => void;
    /** Espera entre reintentos. Los tests la bajan para no dormir segundos. */
    backoffMs?: number;
  } = {},
): Promise<ShopifyFeed> {
  const maxPages = config.maxPages ?? 60;
  const products: ShopifyProduct[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://${config.domain}/products.json?limit=250&page=${page}`;
    let batch: ShopifyProduct[];
    try {
      batch = await fetchPage(url, 3, backoffMs);
    } catch (err) {
      // La primera página es distinta: sin ella no hay feed, sólo un dominio
      // que no responde, y eso sí tiene que fallar ruidosamente.
      if (page === 1) throw new Error(`${config.domain}: ${(err as Error).message}`);
      onPartial?.(page, (err as Error).message);
      return { products, partial: true };
    }
    onPage?.(page, batch.length);
    products.push(...batch);
    if (batch.length < 250) break;
    // Cortesía con la tienda: no la martillamos.
    await sleep(400);
  }

  return { products };
}

export function readSnapshot(slug: string, kind: "live" | "sample"): ShopifyFeed | null {
  const file = snapshotPath(slug, kind);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ShopifyFeed;
}

/**
 * Deja el feed en la forma mínima y ESTABLE que la ingesta necesita.
 *
 * El feed crudo de Shopify trae `body_html`, timestamps y un orden que cambia
 * entre corridas, así que guardarlo tal cual hacía que el job de sincronización
 * reescribiera el archivo entero cada 6 horas —decenas de miles de líneas que
 * entran y salen— aunque el catálogo no hubiera cambiado. Normalizado, una
 * corrida sin cambios produce un archivo idéntico y no genera commit.
 */
export function normalizeFeed(feed: ShopifyFeed): ShopifyFeed {
  const products = (feed.products ?? [])
    .map((p) => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      vendor: p.vendor,
      product_type: p.product_type,
      tags: tagsOf(p).slice().sort(),
      variants: (p.variants ?? [])
        .map((v) => ({
          id: v.id,
          title: v.title,
          price: v.price,
          available: v.available,
          ...(v.sku ? { sku: v.sku } : {}),
          ...(v.featured_image?.src ? { featured_image: { src: v.featured_image.src } } : {}),
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      images: p.images?.[0]?.src ? [{ src: p.images[0].src }] : [],
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return { products };
}

export function writeSnapshot(slug: string, kind: "live" | "sample", feed: ShopifyFeed) {
  const file = snapshotPath(slug, kind);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(normalizeFeed(feed), null, 2));
  return file;
}

function tagsOf(product: ShopifyProduct): string[] {
  if (Array.isArray(product.tags)) return product.tags;
  if (typeof product.tags === "string") return product.tags.split(",").map((t) => t.trim());
  return [];
}

/** Aplana el feed de Shopify a listings crudos (una fila por variante). */
export function shopifyFeedToListings(
  feed: ShopifyFeed,
  config: ShopifyConfig,
  source: "live" | "sample",
): AdapterResult {
  const listings: RawListing[] = [];
  const allow = config.productTypes?.map((t) => t.toLowerCase());

  for (const product of feed.products) {
    if (allow && !allow.includes((product.product_type ?? "").toLowerCase())) continue;
    const productUrl = `https://${config.domain}/products/${product.handle}`;
    const image = product.images?.[0]?.src;

    for (const variant of product.variants ?? []) {
      const price = Number.parseFloat(variant.price);
      listings.push({
        externalId: String(variant.id),
        title: product.title,
        variantTitle: variant.title === "Default Title" ? undefined : variant.title,
        vendor: product.vendor,
        productType: product.product_type,
        tags: tagsOf(product),
        priceMxn: price,
        available: Boolean(variant.available),
        // /products.json no expone inventario real, sólo disponibilidad.
        stock: variant.available ? 1 : 0,
        productUrl: `${productUrl}?variant=${variant.id}`,
        imageUrl: variant.featured_image?.src ?? image,
      });
    }
  }

  return { listings, productsSeen: feed.products.length, source, partial: feed.partial };
}

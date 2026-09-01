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
}

const USER_AGENT =
  "tcgpool/0.1 (comparador de cartas TCG MX; contacto: hola@tcgpool.mx)";

function snapshotPath(slug: string, kind: "live" | "sample") {
  return path.join(process.cwd(), "data", "snapshots", `${slug}.${kind}.json`);
}

/** Recorre /products.json paginado y devuelve el feed crudo. */
export async function fetchShopifyFeed(
  config: ShopifyConfig,
  { onPage }: { onPage?: (page: number, count: number) => void } = {},
): Promise<ShopifyFeed> {
  const maxPages = config.maxPages ?? 20;
  const products: ShopifyProduct[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://${config.domain}/products.json?limit=250&page=${page}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`${config.domain}: HTTP ${res.status} en ${url}`);
    }
    const body = (await res.json()) as ShopifyFeed;
    const batch = body.products ?? [];
    onPage?.(page, batch.length);
    products.push(...batch);
    if (batch.length < 250) break;
    // Cortesía con la tienda: no la martillamos.
    await new Promise((r) => setTimeout(r, 400));
  }

  return { products };
}

export function readSnapshot(slug: string, kind: "live" | "sample"): ShopifyFeed | null {
  const file = snapshotPath(slug, kind);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ShopifyFeed;
}

export function writeSnapshot(slug: string, kind: "live" | "sample", feed: ShopifyFeed) {
  const file = snapshotPath(slug, kind);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(feed, null, 2));
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

  return { listings, productsSeen: feed.products.length, source };
}

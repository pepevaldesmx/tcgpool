import fs from "node:fs";
import path from "node:path";
import type { AdapterResult, RawListing } from "@/lib/types";

/**
 * Adaptador para tiendas sin feed público (MTG Wolf corre en Wix y no expone
 * un equivalente a /products.json). Lee un archivo JSON con listings ya
 * capturados a mano / por scraping externo, con este shape:
 *
 *   { "listings": [ { "externalId", "title", "variantTitle", "priceMxn",
 *                     "available", "productUrl", "imageUrl" } ] }
 *
 * Cuando exista un scraper de Wix, sustituye este adaptador sin tocar el resto
 * de la ingesta.
 */

export interface ManualConfig {
  /** Ruta relativa al repo. Default: data/snapshots/<slug>.manual.json */
  file?: string;
}

export function readManualFeed(slug: string, config: ManualConfig): AdapterResult {
  const file = path.join(
    process.cwd(),
    config.file ?? path.join("data", "snapshots", `${slug}.manual.json`),
  );
  if (!fs.existsSync(file)) {
    return { listings: [], productsSeen: 0, source: "sample" };
  }
  const body = JSON.parse(fs.readFileSync(file, "utf8")) as { listings: RawListing[] };
  const listings = body.listings ?? [];
  return { listings, productsSeen: listings.length, source: "sample" };
}

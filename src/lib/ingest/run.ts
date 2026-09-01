import type { Database } from "better-sqlite3";
import type { AdapterResult } from "@/lib/types";
import {
  fetchShopifyFeed,
  readSnapshot,
  shopifyFeedToListings,
  writeSnapshot,
  type ShopifyConfig,
} from "@/lib/ingest/adapters/shopify";
import { readManualFeed, type ManualConfig } from "@/lib/ingest/adapters/manual";
import { normalizeListing } from "@/lib/ingest/normalize";
import type { StoreDefinition } from "@/lib/ingest/registry";
import { cardImage, lookupCardByName, saveCache } from "@/lib/cards/scryfall";
import {
  finishSyncRun,
  markMissingAsOutOfStock,
  startSyncRun,
  touchStoreSync,
  upsertCard,
  upsertListing,
  upsertPrinting,
  upsertStore,
  upsertStoreSeller,
} from "@/lib/db/queries";

export type SyncMode = "live" | "snapshot";

export interface SyncOptions {
  /** 'live' pega al feed real de la tienda; 'snapshot' lee data/snapshots/. */
  mode: SyncMode;
  /** Resolver nombres contra Scryfall (nombre canónico + imagen). */
  enrich?: boolean;
  /** Sólo usar la caché de Scryfall, nunca la red. */
  offline?: boolean;
  gameId?: string;
  log?: (msg: string) => void;
}

export interface SyncResult {
  store: string;
  source: "live" | "sample";
  productsSeen: number;
  upserted: number;
  skipped: number;
  outOfStock: number;
  error?: string;
}

async function runAdapter(def: StoreDefinition, opts: SyncOptions): Promise<AdapterResult> {
  if (def.sourceType === "shopify") {
    const config = def.sourceConfig as unknown as ShopifyConfig;
    if (opts.mode === "live") {
      const feed = await fetchShopifyFeed(config, {
        onPage: (page, count) => opts.log?.(`  página ${page}: ${count} productos`),
      });
      // Guardamos el feed crudo: permite re-normalizar sin volver a pegarle a
      // la tienda y deja evidencia de qué se ingirió.
      writeSnapshot(def.slug, "live", feed);
      return shopifyFeedToListings(feed, config, "live");
    }
    const feed = readSnapshot(def.slug, "live") ?? readSnapshot(def.slug, "sample");
    if (!feed) return { listings: [], productsSeen: 0, source: "sample" };
    const kind = readSnapshot(def.slug, "live") ? "live" : "sample";
    return shopifyFeedToListings(feed, config, kind);
  }

  if (def.sourceType === "manual" || def.sourceType === "wix") {
    return readManualFeed(def.slug, def.sourceConfig as ManualConfig);
  }

  throw new Error(`Adaptador no implementado para sourceType='${def.sourceType}'`);
}

export async function syncStore(
  db: Database,
  def: StoreDefinition,
  opts: SyncOptions,
): Promise<SyncResult> {
  const gameId = opts.gameId ?? "magic";
  const log = opts.log ?? (() => {});

  const storeId = upsertStore(db, {
    slug: def.slug,
    name: def.name,
    url: def.url,
    city: def.city,
    sourceType: def.sourceType,
    sourceConfig: def.sourceConfig,
    active: def.active,
  });
  const sellerId = upsertStoreSeller(db, storeId, def.name, `store-${def.slug}`);

  const runId = startSyncRun(db, storeId, opts.mode);
  const now = new Date().toISOString();

  try {
    const result = await runAdapter(def, opts);
    log(`  ${result.listings.length} variantes crudas (${result.productsSeen} productos)`);

    let upserted = 0;
    let skipped = 0;
    const seen: string[] = [];

    // Resolvemos contra Scryfall fuera de la transacción (hay I/O de red) y
    // después escribimos todo de un jalón.
    const prepared: Array<{
      printing: Parameters<typeof upsertPrinting>[1];
      card: Parameters<typeof upsertCard>[1];
      listing: Omit<Parameters<typeof upsertListing>[1], "printingId">;
    }> = [];

    for (const raw of result.listings) {
      const n = normalizeListing(raw);
      if (!n) {
        skipped++;
        continue;
      }

      let canonicalName = n.cardName;
      let cardImageUrl: string | null = n.imageUrl ?? null;
      let oracleId: string | null = null;
      let typeLine: string | null = null;
      let setCode: string | null = null;

      if (opts.enrich !== false && gameId === "magic") {
        const sc = await lookupCardByName(n.cardName, { offline: opts.offline });
        if (sc) {
          canonicalName = sc.name;
          cardImageUrl = cardImage(sc) ?? cardImageUrl;
          oracleId = sc.oracle_id ?? null;
          typeLine = sc.type_line ?? null;
          if (n.setName && sc.set_name?.toLowerCase() === n.setName.toLowerCase()) {
            setCode = sc.set;
          }
        }
      }

      seen.push(n.externalId);
      prepared.push({
        card: { gameId, name: canonicalName, oracleId, imageUrl: cardImageUrl, typeLine },
        printing: {
          cardId: 0, // se rellena al escribir
          setCode,
          setName: n.setName ?? null,
          language: n.language,
          finish: n.finish,
          imageUrl: n.imageUrl ?? null,
        },
        listing: {
          sellerId,
          storeId,
          priceCents: n.priceCents,
          condition: n.condition,
          stock: n.stock,
          inStock: n.inStock,
          productUrl: n.productUrl,
          rawTitle: n.rawTitle,
          externalId: n.externalId,
          now,
        },
      });
    }

    const write = db.transaction(() => {
      for (const p of prepared) {
        const cardId = upsertCard(db, p.card);
        const printingId = upsertPrinting(db, { ...p.printing, cardId });
        upsertListing(db, { ...p.listing, printingId });
        upserted++;
      }
    });
    write();

    const outOfStock = markMissingAsOutOfStock(db, storeId, seen, now);
    touchStoreSync(db, storeId);
    finishSyncRun(db, runId, {
      status: "ok",
      productsSeen: result.productsSeen,
      upserted,
      skipped,
    });
    saveCache();

    return {
      store: def.slug,
      source: result.source,
      productsSeen: result.productsSeen,
      upserted,
      skipped,
      outOfStock,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishSyncRun(db, runId, { status: "error", error: message });
    return {
      store: def.slug,
      source: opts.mode === "live" ? "live" : "sample",
      productsSeen: 0,
      upserted: 0,
      skipped: 0,
      outOfStock: 0,
      error: message,
    };
  }
}

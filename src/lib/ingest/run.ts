import type { AdapterResult, GameId } from "@/lib/types";
import {
  fetchShopifyFeed,
  readSnapshot,
  shopifyFeedToListings,
  writeSnapshot,
  type ShopifyConfig,
} from "@/lib/ingest/adapters/shopify";
import { readManualFeed, type ManualConfig } from "@/lib/ingest/adapters/manual";
import { normalizeListing, normalizeText } from "@/lib/ingest/normalize";
import type { StoreDefinition } from "@/lib/ingest/registry";
import { cardImage, lookupCardByName, saveCache } from "@/lib/cards/scryfall";
import {
  finishSyncRun,
  markMissingAsOutOfStock,
  printingMatchKey,
  startSyncRun,
  touchStoreSync,
  upsertCards,
  upsertListings,
  upsertPrintings,
  upsertStore,
  upsertStoreSeller,
  type ListingInput,
  type PrintingInput,
} from "@/lib/db/queries";

export type SyncMode = "live" | "snapshot";

export interface SyncOptions {
  /** 'live' pega al feed real de la tienda; 'snapshot' lee data/snapshots/. */
  mode: SyncMode;
  /** Resolver nombres contra Scryfall (nombre canónico + imagen). */
  enrich?: boolean;
  /** Sólo usar la caché de Scryfall, nunca la red. */
  offline?: boolean;
  /** Juego a asumir si ni el feed ni la tienda lo declaran. */
  gameId?: GameId;
  log?: (msg: string) => void;
}

export interface SyncResult {
  store: string;
  source: "live" | "sample";
  productsSeen: number;
  upserted: number;
  skipped: number;
  outOfStock: number;
  /** El feed se cortó: lo ingerido sirve, pero no se barrió lo ausente. */
  partial?: boolean;
  perGame: Record<string, number>;
  error?: string;
}

async function runAdapter(def: StoreDefinition, opts: SyncOptions): Promise<AdapterResult> {
  if (def.sourceType === "shopify") {
    const config = def.sourceConfig as unknown as ShopifyConfig;
    if (opts.mode === "live") {
      const feed = await fetchShopifyFeed(config, {
        onPage: (page, count) => opts.log?.(`  página ${page}: ${count} productos`),
        onPartial: (page, reason) =>
          opts.log?.(`  ⚠ el feed se cortó en la página ${page} (${reason}); seguimos con lo que hay`),
      });
      // Guardamos el feed normalizado: permite re-ingerir sin volver a pegarle a
      // la tienda y deja evidencia de qué se ingirió. Un feed cortado no
      // sustituye al último completo: sería cambiar evidencia buena por peor.
      if (!feed.partial) writeSnapshot(def.slug, "live", feed);
      return shopifyFeedToListings(feed, config, "live");
    }
    const live = readSnapshot(def.slug, "live");
    const feed = live ?? readSnapshot(def.slug, "sample");
    if (!feed) return { listings: [], productsSeen: 0, source: "sample" };
    return shopifyFeedToListings(feed, config, live ? "live" : "sample");
  }

  if (def.sourceType === "manual" || def.sourceType === "wix") {
    return readManualFeed(def.slug, def.sourceConfig as ManualConfig);
  }

  throw new Error(`Adaptador no implementado para sourceType='${def.sourceType}'`);
}

export async function syncStore(
  def: StoreDefinition,
  opts: SyncOptions,
): Promise<SyncResult> {
  const defaultGame = def.defaultGame ?? opts.gameId ?? "magic";
  const log = opts.log ?? (() => {});

  const storeId = await upsertStore({
    slug: def.slug,
    name: def.name,
    url: def.url,
    city: def.city,
    lat: def.lat,
    lng: def.lng,
    sourceType: def.sourceType,
    sourceConfig: def.sourceConfig,
    defaultGame,
    active: def.active,
  });
  const sellerId = await upsertStoreSeller(storeId, def.name, `store-${def.slug}`);
  const runId = await startSyncRun(storeId, opts.mode);

  try {
    const result = await runAdapter(def, opts);
    log(`  ${result.listings.length} variantes crudas (${result.productsSeen} productos)`);

    // 1) Normalizar y resolver contra Scryfall. Aquí está el I/O de red, así
    //    que se hace antes de tocar la base.
    interface Pending {
      cardKey: string;
      printing: Omit<PrintingInput, "cardId">;
      listing: Omit<ListingInput, "printingId" | "sellerId" | "storeId">;
    }
    const pending: Pending[] = [];
    const cards = new Map<string, Parameters<typeof upsertCards>[0][number]>();
    const perGame: Record<string, number> = {};
    const seen: string[] = [];
    let skipped = 0;

    for (const raw of result.listings) {
      const n = normalizeListing(raw, defaultGame);
      if (!n) {
        skipped++;
        continue;
      }

      let canonicalName = n.cardName;
      let cardImageUrl: string | null = n.imageUrl ?? null;
      let oracleId: string | null = null;
      let typeLine: string | null = null;
      let setCode: string | null = null;

      // Scryfall sólo conoce Magic: para los demás juegos no hay a qué resolver.
      if (opts.enrich !== false && n.game === "magic") {
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

      const cardKey = `${n.game}|${normalizeText(canonicalName)}`;
      if (!cards.has(cardKey)) {
        cards.set(cardKey, {
          gameId: n.game,
          name: canonicalName,
          oracleId,
          imageUrl: cardImageUrl,
          typeLine,
        });
      }

      seen.push(n.externalId);
      perGame[n.game] = (perGame[n.game] ?? 0) + 1;
      pending.push({
        cardKey,
        printing: {
          setCode,
          setName: n.setName ?? null,
          language: n.language,
          finish: n.finish,
          imageUrl: n.imageUrl ?? null,
        },
        listing: {
          priceCents: n.priceCents,
          condition: n.condition,
          stock: n.stock,
          inStock: n.inStock,
          productUrl: n.productUrl,
          rawTitle: n.rawTitle,
          externalId: n.externalId,
          origin: "feed",
        },
      });
    }

    // 2) Escribir en tres lotes: cartas, impresiones y listados.
    const cardIds = await upsertCards([...cards.values()]);

    const printings = new Map<string, PrintingInput>();
    for (const p of pending) {
      const cardId = cardIds.get(p.cardKey);
      if (cardId == null) continue;
      const input: PrintingInput = { ...p.printing, cardId };
      printings.set(`${cardId}|${printingMatchKey(input)}`, input);
    }
    const printingIds = await upsertPrintings([...printings.values()]);

    const listings: ListingInput[] = [];
    for (const p of pending) {
      const cardId = cardIds.get(p.cardKey);
      if (cardId == null) continue;
      const key = `${cardId}|${printingMatchKey({ ...p.printing, cardId })}`;
      const printingId = printingIds.get(key);
      if (printingId == null) continue;
      listings.push({ ...p.listing, printingId, sellerId, storeId });
    }
    const upserted = await upsertListings(listings);

    if (Object.keys(perGame).length > 1) {
      log(
        `  juegos: ${Object.entries(perGame)
          .sort((a, b) => b[1] - a[1])
          .map(([g, n]) => `${g} ${n}`)
          .join(" · ")}`,
      );
    }

    // Sólo se puede concluir "esto ya no está, márcalo agotado" cuando se vio
    // el catálogo COMPLETO. Con un feed cortado, barrer marcaría como agotado
    // todo lo que quedó en las páginas que no llegaron.
    const outOfStock = result.partial ? 0 : await markMissingAsOutOfStock(storeId, seen);
    await touchStoreSync(storeId, result.source);
    await finishSyncRun(runId, {
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
      partial: result.partial,
      perGame,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishSyncRun(runId, { status: "error", error: message });
    return {
      store: def.slug,
      source: opts.mode === "live" ? "live" : "sample",
      productsSeen: 0,
      upserted: 0,
      skipped: 0,
      outOfStock: 0,
      perGame: {},
      error: message,
    };
  }
}

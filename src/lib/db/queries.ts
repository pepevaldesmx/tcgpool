import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { normalizeText, slugify } from "@/lib/ingest/normalize";
import type { Condition, Finish } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tipos de lectura (lo que consume la UI)
// ---------------------------------------------------------------------------

export interface CardSummary {
  id: number;
  name: string;
  slug: string;
  gameId: string;
  imageUrl: string | null;
  typeLine: string | null;
  listingCount: number;
  storeCount: number;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  inStockCount: number;
}

export interface ListingRow {
  id: number;
  priceCents: number;
  currency: string;
  condition: Condition;
  stock: number;
  inStock: number;
  productUrl: string;
  rawTitle: string;
  updatedAt: string;
  setName: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  language: string;
  finish: Finish;
  printingImage: string | null;
  storeId: number;
  storeName: string;
  storeSlug: string;
  storeUrl: string;
  storeCity: string | null;
  sellerName: string;
  sellerType: string;
}

export interface StoreRow {
  id: number;
  slug: string;
  name: string;
  url: string;
  city: string | null;
  sourceType: string;
  sourceConfig: string;
  active: number;
  lastSyncedAt: string | null;
}

// ---------------------------------------------------------------------------
// Escritura (ingesta)
// ---------------------------------------------------------------------------

export function upsertGame(db: Database, id: string, name: string) {
  db.prepare(
    `INSERT INTO games (id, name) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
  ).run(id, name);
}

export function upsertStore(
  db: Database,
  s: {
    slug: string;
    name: string;
    url: string;
    city?: string;
    lat?: number;
    lng?: number;
    sourceType: string;
    sourceConfig: Record<string, unknown>;
    shipsNationwide?: boolean;
    active?: boolean;
  },
): number {
  db.prepare(
    `INSERT INTO stores (slug, name, url, city, lat, lng, source_type, source_config, ships_nationwide, active)
     VALUES (@slug, @name, @url, @city, @lat, @lng, @sourceType, @sourceConfig, @ships, @active)
     ON CONFLICT(slug) DO UPDATE SET
       name = excluded.name, url = excluded.url, city = excluded.city,
       lat = excluded.lat, lng = excluded.lng,
       source_type = excluded.source_type, source_config = excluded.source_config,
       ships_nationwide = excluded.ships_nationwide, active = excluded.active`,
  ).run({
    slug: s.slug,
    name: s.name,
    url: s.url,
    city: s.city ?? null,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    sourceType: s.sourceType,
    sourceConfig: JSON.stringify(s.sourceConfig ?? {}),
    ships: s.shipsNationwide === false ? 0 : 1,
    active: s.active === false ? 0 : 1,
  });
  const row = db.prepare(`SELECT id FROM stores WHERE slug = ?`).get(s.slug) as { id: number };
  return row.id;
}

/**
 * Cada tienda tiene un seller espejo de tipo 'store'. En fase 2 se agregan
 * sellers de tipo 'affiliate' colgados de la misma tienda sin tocar el esquema.
 */
export function upsertStoreSeller(db: Database, storeId: number, name: string, slug: string): number {
  db.prepare(
    `INSERT INTO sellers (slug, name, type, store_id, active)
     VALUES (?, ?, 'store', ?, 1)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, store_id = excluded.store_id`,
  ).run(slug, name, storeId);
  const row = db.prepare(`SELECT id FROM sellers WHERE slug = ?`).get(slug) as { id: number };
  return row.id;
}

export function upsertCard(
  db: Database,
  c: {
    gameId: string;
    name: string;
    oracleId?: string | null;
    imageUrl?: string | null;
    typeLine?: string | null;
  },
): number {
  const matchKey = normalizeText(c.name);
  const slug = slugify(c.name);
  db.prepare(
    `INSERT INTO cards (game_id, name, slug, match_key, oracle_id, image_url, type_line)
     VALUES (@gameId, @name, @slug, @matchKey, @oracleId, @imageUrl, @typeLine)
     ON CONFLICT(game_id, match_key) DO UPDATE SET
       name = excluded.name,
       -- no pisamos con NULL: el primer sync que traiga imagen la conserva
       image_url = COALESCE(excluded.image_url, cards.image_url),
       oracle_id = COALESCE(excluded.oracle_id, cards.oracle_id),
       type_line = COALESCE(excluded.type_line, cards.type_line)`,
  ).run({
    gameId: c.gameId,
    name: c.name,
    slug,
    matchKey,
    oracleId: c.oracleId ?? null,
    imageUrl: c.imageUrl ?? null,
    typeLine: c.typeLine ?? null,
  });
  const row = db
    .prepare(`SELECT id FROM cards WHERE game_id = ? AND match_key = ?`)
    .get(c.gameId, matchKey) as { id: number };
  return row.id;
}

export function upsertPrinting(
  db: Database,
  p: {
    cardId: number;
    setCode?: string | null;
    setName?: string | null;
    collectorNumber?: string | null;
    language: string;
    finish: Finish;
    scryfallId?: string | null;
    imageUrl?: string | null;
  },
): number {
  const matchKey = [
    normalizeText(p.setName ?? p.setCode ?? "sin-set"),
    p.collectorNumber ?? "",
    p.language,
    p.finish,
  ].join("|");

  db.prepare(
    `INSERT INTO printings (card_id, set_code, set_name, collector_number, language, finish, scryfall_id, image_url, match_key)
     VALUES (@cardId, @setCode, @setName, @collectorNumber, @language, @finish, @scryfallId, @imageUrl, @matchKey)
     ON CONFLICT(card_id, match_key) DO UPDATE SET
       set_code = COALESCE(excluded.set_code, printings.set_code),
       set_name = COALESCE(excluded.set_name, printings.set_name),
       image_url = COALESCE(excluded.image_url, printings.image_url),
       scryfall_id = COALESCE(excluded.scryfall_id, printings.scryfall_id)`,
  ).run({
    cardId: p.cardId,
    setCode: p.setCode ?? null,
    setName: p.setName ?? null,
    collectorNumber: p.collectorNumber ?? null,
    language: p.language,
    finish: p.finish,
    scryfallId: p.scryfallId ?? null,
    imageUrl: p.imageUrl ?? null,
    matchKey,
  });

  const row = db
    .prepare(`SELECT id FROM printings WHERE card_id = ? AND match_key = ?`)
    .get(p.cardId, matchKey) as { id: number };
  return row.id;
}

export function upsertListing(
  db: Database,
  l: {
    printingId: number;
    sellerId: number;
    storeId: number;
    priceCents: number;
    condition: Condition;
    stock: number;
    inStock: boolean;
    productUrl: string;
    rawTitle: string;
    externalId: string;
    now: string;
  },
) {
  db.prepare(
    `INSERT INTO listings (printing_id, seller_id, store_id, price_cents, currency, condition,
                           stock, in_stock, product_url, raw_title, external_id, first_seen_at, updated_at)
     VALUES (@printingId, @sellerId, @storeId, @priceCents, 'MXN', @condition,
             @stock, @inStock, @productUrl, @rawTitle, @externalId, @now, @now)
     ON CONFLICT(store_id, external_id) DO UPDATE SET
       printing_id = excluded.printing_id,
       price_cents = excluded.price_cents,
       condition   = excluded.condition,
       stock       = excluded.stock,
       in_stock    = excluded.in_stock,
       product_url = excluded.product_url,
       raw_title   = excluded.raw_title,
       updated_at  = excluded.updated_at`,
  ).run({ ...l, inStock: l.inStock ? 1 : 0 });
}

/**
 * Lo que ya no vino en el feed dejó de estar a la venta. No lo borramos (nos
 * sirve el histórico de precio) — lo marcamos sin stock.
 */
export function markMissingAsOutOfStock(
  db: Database,
  storeId: number,
  seenExternalIds: string[],
  now: string,
): number {
  const seen = new Set(seenExternalIds);
  const rows = db
    .prepare(`SELECT id, external_id FROM listings WHERE store_id = ? AND in_stock = 1`)
    .all(storeId) as Array<{ id: number; external_id: string }>;
  const stale = rows.filter((r) => !seen.has(r.external_id));
  const stmt = db.prepare(
    `UPDATE listings SET in_stock = 0, stock = 0, updated_at = ? WHERE id = ?`,
  );
  for (const row of stale) stmt.run(now, row.id);
  return stale.length;
}

export function startSyncRun(db: Database, storeId: number, source: string): number {
  const info = db
    .prepare(
      `INSERT INTO sync_runs (store_id, source, started_at, status) VALUES (?, ?, ?, 'running')`,
    )
    .run(storeId, source, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

export function finishSyncRun(
  db: Database,
  id: number,
  data: {
    status: "ok" | "error";
    productsSeen?: number;
    upserted?: number;
    skipped?: number;
    error?: string;
  },
) {
  db.prepare(
    `UPDATE sync_runs SET finished_at = ?, status = ?, products_seen = ?,
       listings_upserted = ?, listings_skipped = ?, error = ? WHERE id = ?`,
  ).run(
    new Date().toISOString(),
    data.status,
    data.productsSeen ?? 0,
    data.upserted ?? 0,
    data.skipped ?? 0,
    data.error ?? null,
    id,
  );
}

export function touchStoreSync(db: Database, storeId: number) {
  db.prepare(`UPDATE stores SET last_synced_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    storeId,
  );
}

export function listStoreRows(db: Database): StoreRow[] {
  return db
    .prepare(
      `SELECT id, slug, name, url, city, source_type AS sourceType,
              source_config AS sourceConfig, active, last_synced_at AS lastSyncedAt
       FROM stores ORDER BY name`,
    )
    .all() as StoreRow[];
}

// ---------------------------------------------------------------------------
// Lectura (app)
// ---------------------------------------------------------------------------

const CARD_SUMMARY_SELECT = `
  SELECT c.id, c.name, c.slug, c.game_id AS gameId, c.image_url AS imageUrl,
         c.type_line AS typeLine,
         COUNT(l.id) AS listingCount,
         COUNT(DISTINCT l.store_id) AS storeCount,
         MIN(CASE WHEN l.in_stock = 1 THEN l.price_cents END) AS minPriceCents,
         MAX(CASE WHEN l.in_stock = 1 THEN l.price_cents END) AS maxPriceCents,
         SUM(CASE WHEN l.in_stock = 1 THEN 1 ELSE 0 END) AS inStockCount
  FROM cards c
  LEFT JOIN printings p ON p.card_id = c.id
  LEFT JOIN listings l ON l.printing_id = p.id
`;

/** Convierte "sol ring" en la consulta FTS `sol* AND ring*` (autocomplete). */
function toFtsQuery(q: string): string | null {
  const tokens = normalizeText(q).split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t}"*`).join(" AND ");
}

export function searchCards(
  q: string,
  { limit = 40, onlyInStock = false }: { limit?: number; onlyInStock?: boolean } = {},
): CardSummary[] {
  const db = getDb();
  const fts = toFtsQuery(q);
  if (!fts) return [];

  const having = onlyInStock ? "HAVING inStockCount > 0" : "";
  try {
    return db
      .prepare(
        `${CARD_SUMMARY_SELECT}
         JOIN cards_fts f ON f.rowid = c.id
         WHERE cards_fts MATCH ?
         GROUP BY c.id
         ${having}
         ORDER BY inStockCount > 0 DESC, bm25(cards_fts) ASC, c.name ASC
         LIMIT ?`,
      )
      .all(fts, limit) as CardSummary[];
  } catch {
    // FTS puede reventar con sintaxis rara; caemos a LIKE.
    const like = `%${normalizeText(q)}%`;
    return db
      .prepare(
        `${CARD_SUMMARY_SELECT}
         WHERE c.match_key LIKE ?
         GROUP BY c.id
         ${having}
         ORDER BY inStockCount > 0 DESC, LENGTH(c.name) ASC
         LIMIT ?`,
      )
      .all(like, limit) as CardSummary[];
  }
}

export function getCardBySlug(slug: string): CardSummary | null {
  const db = getDb();
  const row = db
    .prepare(`${CARD_SUMMARY_SELECT} WHERE c.slug = ? GROUP BY c.id`)
    .get(slug) as CardSummary | undefined;
  return row ?? null;
}

export interface ListingFilters {
  onlyInStock?: boolean;
  storeSlugs?: string[];
  conditions?: string[];
  finish?: Finish | "all";
  language?: string | "all";
  sort?: "price_asc" | "price_desc" | "store";
}

export function getListingsForCard(cardId: number, filters: ListingFilters = {}): ListingRow[] {
  const db = getDb();
  const where: string[] = ["p.card_id = ?"];
  const params: unknown[] = [cardId];

  if (filters.onlyInStock) where.push("l.in_stock = 1");
  if (filters.storeSlugs?.length) {
    where.push(`s.slug IN (${filters.storeSlugs.map(() => "?").join(",")})`);
    params.push(...filters.storeSlugs);
  }
  if (filters.conditions?.length) {
    where.push(`l.condition IN (${filters.conditions.map(() => "?").join(",")})`);
    params.push(...filters.conditions);
  }
  if (filters.finish && filters.finish !== "all") {
    where.push("p.finish = ?");
    params.push(filters.finish);
  }
  if (filters.language && filters.language !== "all") {
    where.push("p.language = ?");
    params.push(filters.language);
  }

  const order =
    filters.sort === "price_desc"
      ? "l.in_stock DESC, l.price_cents DESC"
      : filters.sort === "store"
        ? "l.in_stock DESC, s.name ASC, l.price_cents ASC"
        : "l.in_stock DESC, l.price_cents ASC";

  return db
    .prepare(
      `SELECT l.id, l.price_cents AS priceCents, l.currency, l.condition, l.stock,
              l.in_stock AS inStock, l.product_url AS productUrl, l.raw_title AS rawTitle,
              l.updated_at AS updatedAt,
              p.set_name AS setName, p.set_code AS setCode,
              p.collector_number AS collectorNumber, p.language, p.finish,
              p.image_url AS printingImage,
              s.id AS storeId, s.name AS storeName, s.slug AS storeSlug,
              s.url AS storeUrl, s.city AS storeCity,
              se.name AS sellerName, se.type AS sellerType
       FROM listings l
       JOIN printings p ON p.id = l.printing_id
       JOIN stores s ON s.id = l.store_id
       JOIN sellers se ON se.id = l.seller_id
       WHERE ${where.join(" AND ")}
       ORDER BY ${order}`,
    )
    .all(...params) as ListingRow[];
}

export interface StorePublic {
  id: number;
  slug: string;
  name: string;
  url: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  sourceType: string;
  lastSyncedAt: string | null;
  listingCount: number;
  inStockCount: number;
  cardCount: number;
  /** Vendedores afiliados avalados por esta tienda (fase 2; hoy siempre 0). */
  affiliateCount: number;
}

/**
 * Tiendas con su inventario. `inStockCount` suma TODOS los listings que despacha
 * la tienda, así que cuando existan afiliados (fase 2) entran solos en el total
 * sin tocar esta consulta.
 *
 * Orden por defecto: inventario disponible, de mayor a menor. El orden por
 * cercanía se hace en el cliente, que es quien conoce la ubicación.
 */
export function listStoresPublic(): StorePublic[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.id, s.slug, s.name, s.url, s.city, s.lat, s.lng,
              s.source_type AS sourceType, s.last_synced_at AS lastSyncedAt,
              COUNT(l.id) AS listingCount,
              SUM(CASE WHEN l.in_stock = 1 THEN 1 ELSE 0 END) AS inStockCount,
              COUNT(DISTINCT p.card_id) AS cardCount,
              (SELECT COUNT(*) FROM sellers se
                WHERE se.store_id = s.id AND se.type = 'affiliate' AND se.active = 1
              ) AS affiliateCount
       FROM stores s
       LEFT JOIN listings l ON l.store_id = s.id
       LEFT JOIN printings p ON p.id = l.printing_id
       WHERE s.active = 1
       GROUP BY s.id
       ORDER BY inStockCount DESC, s.name`,
    )
    .all() as StorePublic[];
}

export interface GamePublic {
  id: string;
  name: string;
  cardCount: number;
  inStockCount: number;
}

/** Los TCG del catálogo. Los que aún no tienen fuente salen con 0. */
export function listGames(): GamePublic[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT g.id, g.name,
              COUNT(DISTINCT c.id) AS cardCount,
              SUM(CASE WHEN l.in_stock = 1 THEN 1 ELSE 0 END) AS inStockCount
       FROM games g
       LEFT JOIN cards c ON c.game_id = g.id
       LEFT JOIN printings p ON p.card_id = c.id
       LEFT JOIN listings l ON l.printing_id = p.id
       GROUP BY g.id
       ORDER BY inStockCount DESC, g.name`,
    )
    .all() as GamePublic[];
}

export interface Stats {
  stores: number;
  cards: number;
  listings: number;
  inStock: number;
  lastSyncedAt: string | null;
}

export function getStats(): Stats {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM stores WHERE active = 1) AS stores,
              (SELECT COUNT(*) FROM cards) AS cards,
              (SELECT COUNT(*) FROM listings) AS listings,
              (SELECT COUNT(*) FROM listings WHERE in_stock = 1) AS inStock,
              (SELECT MAX(last_synced_at) FROM stores) AS lastSyncedAt`,
    )
    .get() as Stats;
  return row;
}

/** Cartas con oferta repartida entre varias tiendas: el "aha" de la demo. */
export function getMultiStoreCards(limit = 8): CardSummary[] {
  const db = getDb();
  return db
    .prepare(
      `${CARD_SUMMARY_SELECT}
       GROUP BY c.id
       HAVING storeCount > 1 AND inStockCount > 0
       ORDER BY storeCount DESC, listingCount DESC, c.name ASC
       LIMIT ?`,
    )
    .all(limit) as CardSummary[];
}

/**
 * ¿Los datos que se están mostrando salen de los feeds reales de las tiendas o
 * de los snapshots de muestra? La UI lo advierte para no enseñar precios
 * inventados como si fueran reales.
 */
export function isSampleData(): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM sync_runs WHERE source = 'live' AND status = 'ok'`)
    .get() as { n: number };
  return row.n === 0;
}

// ---------------------------------------------------------------------------
// Búsqueda por lista (decklist)
// ---------------------------------------------------------------------------

/**
 * Resuelve un nombre suelto a una carta del catálogo: primero exacto, luego la
 * mejor coincidencia de FTS. Devuelve null si no hay nada razonable.
 */
export function findCardByName(name: string): CardSummary | null {
  const db = getDb();
  const matchKey = normalizeText(name);
  if (!matchKey) return null;

  const exact = db
    .prepare(`${CARD_SUMMARY_SELECT} WHERE c.match_key = ? GROUP BY c.id`)
    .get(matchKey) as CardSummary | undefined;
  if (exact) return exact;

  return searchCards(name, { limit: 1 })[0] ?? null;
}

export interface CardStorePrice {
  cardId: number;
  storeId: number;
  storeSlug: string;
  storeName: string;
  storeCity: string | null;
  priceCents: number;
}

/** Precio más barato con stock de cada carta en cada tienda. */
export function getCheapestByCardAndStore(cardIds: number[]): CardStorePrice[] {
  if (!cardIds.length) return [];
  const db = getDb();
  const placeholders = cardIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT p.card_id AS cardId, s.id AS storeId, s.slug AS storeSlug,
              s.name AS storeName, s.city AS storeCity,
              MIN(l.price_cents) AS priceCents
       FROM listings l
       JOIN printings p ON p.id = l.printing_id
       JOIN stores s ON s.id = l.store_id
       WHERE l.in_stock = 1 AND p.card_id IN (${placeholders})
       GROUP BY p.card_id, s.id`,
    )
    .all(...cardIds) as CardStorePrice[];
}

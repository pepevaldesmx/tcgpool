import { one, query, transaction } from "@/lib/db";
import { normalizeText, slugify } from "@/lib/ingest/normalize";
import type { Condition, Finish, GameId } from "@/lib/types";

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
  inStock: boolean;
  productUrl: string;
  rawTitle: string;
  updatedAt: string;
  origin: string;
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
  storeLat: number | null;
  storeLng: number | null;
  storeDataSource: "live" | "sample";
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
  sourceConfig: unknown;
  active: boolean;
  lastSyncedAt: string | null;
}

// ---------------------------------------------------------------------------
// Escritura (ingesta y panel de tienda)
// ---------------------------------------------------------------------------

export async function upsertGame(id: string, name: string): Promise<void> {
  await query(
    `INSERT INTO games (id, name) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [id, name],
  );
}

export async function upsertStore(s: {
  slug: string;
  name: string;
  url: string;
  city?: string;
  lat?: number;
  lng?: number;
  sourceType: string;
  sourceConfig: Record<string, unknown>;
  defaultGame?: GameId;
  shipsNationwide?: boolean;
  active?: boolean;
}): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO stores (slug, name, url, city, lat, lng, source_type, source_config,
                         default_game, ships_nationwide, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name, url = EXCLUDED.url, city = EXCLUDED.city,
       lat = EXCLUDED.lat, lng = EXCLUDED.lng,
       source_type = EXCLUDED.source_type, source_config = EXCLUDED.source_config,
       default_game = EXCLUDED.default_game,
       ships_nationwide = EXCLUDED.ships_nationwide, active = EXCLUDED.active
     RETURNING id`,
    [
      s.slug, s.name, s.url, s.city ?? null, s.lat ?? null, s.lng ?? null,
      s.sourceType, JSON.stringify(s.sourceConfig ?? {}), s.defaultGame ?? null,
      s.shipsNationwide !== false, s.active !== false,
    ],
  );
  return row!.id;
}

/**
 * Cada tienda tiene un seller espejo de tipo 'store'. Los afiliados se agregan
 * como sellers de tipo 'affiliate' colgados de la misma tienda.
 */
export async function upsertStoreSeller(
  storeId: number,
  name: string,
  slug: string,
): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO sellers (slug, name, type, store_id, active)
     VALUES ($1, $2, 'store', $3, TRUE)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, store_id = EXCLUDED.store_id
     RETURNING id`,
    [slug, name, storeId],
  );
  return row!.id;
}

export async function upsertCard(c: {
  gameId: string;
  name: string;
  oracleId?: string | null;
  imageUrl?: string | null;
  typeLine?: string | null;
}): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO cards (game_id, name, slug, match_key, oracle_id, image_url, type_line)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (game_id, match_key) DO UPDATE SET
       name = EXCLUDED.name,
       -- no pisamos con NULL: el primer sync que traiga imagen la conserva
       image_url = COALESCE(EXCLUDED.image_url, cards.image_url),
       oracle_id = COALESCE(EXCLUDED.oracle_id, cards.oracle_id),
       type_line = COALESCE(EXCLUDED.type_line, cards.type_line)
     RETURNING id`,
    [
      c.gameId, c.name, slugify(c.name), normalizeText(c.name),
      c.oracleId ?? null, c.imageUrl ?? null, c.typeLine ?? null,
    ],
  );
  return row!.id;
}

export async function upsertPrinting(p: {
  cardId: number;
  setCode?: string | null;
  setName?: string | null;
  collectorNumber?: string | null;
  language: string;
  finish: Finish;
  scryfallId?: string | null;
  imageUrl?: string | null;
}): Promise<number> {
  const matchKey = [
    normalizeText(p.setName ?? p.setCode ?? "sin-set"),
    p.collectorNumber ?? "",
    p.language,
    p.finish,
  ].join("|");

  const row = await one<{ id: number }>(
    `INSERT INTO printings (card_id, set_code, set_name, collector_number, language,
                            finish, scryfall_id, image_url, match_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (card_id, match_key) DO UPDATE SET
       set_code = COALESCE(EXCLUDED.set_code, printings.set_code),
       set_name = COALESCE(EXCLUDED.set_name, printings.set_name),
       image_url = COALESCE(EXCLUDED.image_url, printings.image_url),
       scryfall_id = COALESCE(EXCLUDED.scryfall_id, printings.scryfall_id)
     RETURNING id`,
    [
      p.cardId, p.setCode ?? null, p.setName ?? null, p.collectorNumber ?? null,
      p.language, p.finish, p.scryfallId ?? null, p.imageUrl ?? null, matchKey,
    ],
  );
  return row!.id;
}

/**
 * Upsert de cartas en lote. Devuelve el id de cada una por su llave
 * `gameId|matchKey`.
 *
 * En lote y no una por una porque una tienda real trae decenas de miles de
 * listados: fila por fila serían cien mil viajes de red contra Postgres, que es
 * remoto. Con SQLite local no importaba; aquí es la diferencia entre segundos y
 * media hora.
 */
export async function upsertCards(
  rows: Array<{
    gameId: string;
    name: string;
    oracleId?: string | null;
    imageUrl?: string | null;
    typeLine?: string | null;
  }>,
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  if (!rows.length) return ids;

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((c, j) => {
      const b = j * 7;
      values.push(
        c.gameId, c.name, slugify(c.name), normalizeText(c.name),
        c.oracleId ?? null, c.imageUrl ?? null, c.typeLine ?? null,
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
    });
    const out = await query<{ id: number; game_id: string; match_key: string }>(
      `INSERT INTO cards (game_id, name, slug, match_key, oracle_id, image_url, type_line)
       VALUES ${tuples.join(",")}
       ON CONFLICT (game_id, match_key) DO UPDATE SET
         name = EXCLUDED.name,
         image_url = COALESCE(EXCLUDED.image_url, cards.image_url),
         oracle_id = COALESCE(EXCLUDED.oracle_id, cards.oracle_id),
         type_line = COALESCE(EXCLUDED.type_line, cards.type_line)
       RETURNING id, game_id, match_key`,
      values,
    );
    for (const r of out) ids.set(`${r.game_id}|${r.match_key}`, r.id);
  }
  return ids;
}

export interface PrintingInput {
  cardId: number;
  setCode?: string | null;
  setName?: string | null;
  collectorNumber?: string | null;
  language: string;
  finish: Finish;
  scryfallId?: string | null;
  imageUrl?: string | null;
}

export function printingMatchKey(p: PrintingInput): string {
  return [
    normalizeText(p.setName ?? p.setCode ?? "sin-set"),
    p.collectorNumber ?? "",
    p.language,
    p.finish,
  ].join("|");
}

/** Upsert de impresiones en lote. Llave: `cardId|matchKey`. */
export async function upsertPrintings(rows: PrintingInput[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  if (!rows.length) return ids;

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((p, j) => {
      const b = j * 9;
      values.push(
        p.cardId, p.setCode ?? null, p.setName ?? null, p.collectorNumber ?? null,
        p.language, p.finish, p.scryfallId ?? null, p.imageUrl ?? null,
        printingMatchKey(p),
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`;
    });
    const out = await query<{ id: number; card_id: number; match_key: string }>(
      `INSERT INTO printings (card_id, set_code, set_name, collector_number, language,
                              finish, scryfall_id, image_url, match_key)
       VALUES ${tuples.join(",")}
       ON CONFLICT (card_id, match_key) DO UPDATE SET
         set_code = COALESCE(EXCLUDED.set_code, printings.set_code),
         set_name = COALESCE(EXCLUDED.set_name, printings.set_name),
         image_url = COALESCE(EXCLUDED.image_url, printings.image_url),
         scryfall_id = COALESCE(EXCLUDED.scryfall_id, printings.scryfall_id)
       RETURNING id, card_id, match_key`,
      values,
    );
    for (const r of out) ids.set(`${r.card_id}|${r.match_key}`, r.id);
  }
  return ids;
}

export interface ListingInput {
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
  origin?: "feed" | "manual";
}

/** Inserta o actualiza listings en lote, dentro de una transacción. */
export async function upsertListings(rows: ListingInput[]): Promise<number> {
  if (!rows.length) return 0;
  return transaction(async (run) => {
    let n = 0;
    // Lotes: un INSERT por fila serían decenas de miles de viajes de red.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const tuples = chunk.map((r, j) => {
        const b = j * 11;
        values.push(
          r.printingId, r.sellerId, r.storeId, r.priceCents, r.condition,
          r.stock, r.inStock, r.productUrl, r.rawTitle, r.externalId,
          r.origin ?? "feed",
        );
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`;
      });
      await run(
        `INSERT INTO listings (printing_id, seller_id, store_id, price_cents, condition,
                               stock, in_stock, product_url, raw_title, external_id, origin)
         VALUES ${tuples.join(",")}
         ON CONFLICT (store_id, external_id) DO UPDATE SET
           printing_id = EXCLUDED.printing_id,
           price_cents = EXCLUDED.price_cents,
           condition   = EXCLUDED.condition,
           stock       = EXCLUDED.stock,
           in_stock    = EXCLUDED.in_stock,
           product_url = EXCLUDED.product_url,
           raw_title   = EXCLUDED.raw_title,
           updated_at  = now()`,
        values,
      );
      n += chunk.length;
    }
    return n;
  });
}

/**
 * Lo que ya no vino en el feed dejó de estar a la venta.
 *
 * Sólo toca `origin = 'feed'`: lo que la tienda capturó a mano en su panel, o lo
 * que subió un afiliado, no está en el feed de Shopify y barrerlo lo borraría en
 * cada sincronización.
 */
export async function markMissingAsOutOfStock(
  storeId: number,
  seenExternalIds: string[],
): Promise<number> {
  const rows = await query<{ id: number }>(
    `UPDATE listings SET in_stock = FALSE, stock = 0, updated_at = now()
     WHERE store_id = $1 AND in_stock AND origin = 'feed'
       AND NOT (external_id = ANY($2::text[]))
     RETURNING id`,
    [storeId, seenExternalIds],
  );
  return rows.length;
}

/**
 * Borra las tiendas que ya no están en el registro, y detrás de ellas las
 * impresiones y cartas que se quedaron sin ningún listado.
 *
 * `data/stores.json` es el registro: quitar una tienda de ahí tiene que sacarla
 * del buscador. Sin esto se quedaba en la base para siempre —sus listados
 * seguían saliendo en las búsquedas, porque el SQL del catálogo no filtra por
 * tienda activa— y el catálogo acumulaba cartas fantasma de tiendas que ya no
 * existen.
 */
export async function pruneStoresNotIn(
  slugs: string[],
): Promise<{ stores: string[]; printings: number; cards: number }> {
  // Con el registro vacío no se borra nada: sería confundir "no pude leer el
  // registro" con "ya no hay tiendas".
  if (!slugs.length) return { stores: [], printings: 0, cards: 0 };

  const gone = await query<{ slug: string }>(
    `DELETE FROM stores WHERE slug <> ALL($1::text[]) RETURNING slug`,
    [slugs],
  );
  if (!gone.length) return { stores: [], printings: 0, cards: 0 };

  const printings = await query<{ id: number }>(
    `DELETE FROM printings p
      WHERE NOT EXISTS (SELECT 1 FROM listings l WHERE l.printing_id = p.id)
      RETURNING p.id`,
  );
  const cards = await query<{ id: number }>(
    `DELETE FROM cards c
      WHERE NOT EXISTS (SELECT 1 FROM printings p WHERE p.card_id = c.id)
      RETURNING c.id`,
  );
  return { stores: gone.map((g) => g.slug), printings: printings.length, cards: cards.length };
}

/**
 * Saca del catálogo los juegos que ya no aceptamos, con sus cartas y listados.
 *
 * El filtro de la ingesta impide que entren cartas nuevas de un juego apagado,
 * pero no borra las que entraron cuando estaba prendido — y en el buscador una
 * carta vieja de un juego apagado se ve igual que una válida.
 */
export async function pruneGamesNotIn(
  gameIds: string[],
): Promise<{ games: string[]; cards: number }> {
  if (!gameIds.length) return { games: [], cards: 0 };

  const cards = await query<{ id: number }>(
    `DELETE FROM cards WHERE game_id <> ALL($1::text[]) RETURNING id`,
    [gameIds],
  );
  // Un juego que alguna tienda declara como `default_game` se queda: la llave
  // foránea lo exige, y borrarlo dejaría a la tienda apuntando al vacío.
  const games = await query<{ id: string }>(
    `DELETE FROM games g
      WHERE g.id <> ALL($1::text[])
        AND NOT EXISTS (SELECT 1 FROM stores s WHERE s.default_game = g.id)
      RETURNING g.id`,
    [gameIds],
  );
  return { games: games.map((g) => g.id), cards: cards.length };
}

export async function startSyncRun(storeId: number, source: string): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO sync_runs (store_id, source, status) VALUES ($1, $2, 'running') RETURNING id`,
    [storeId, source],
  );
  return row!.id;
}

export async function finishSyncRun(
  id: number,
  data: {
    status: "ok" | "error";
    productsSeen?: number;
    upserted?: number;
    skipped?: number;
    error?: string;
  },
): Promise<void> {
  await query(
    `UPDATE sync_runs SET finished_at = now(), status = $2, products_seen = $3,
       listings_upserted = $4, listings_skipped = $5, error = $6 WHERE id = $1`,
    [id, data.status, data.productsSeen ?? 0, data.upserted ?? 0, data.skipped ?? 0, data.error ?? null],
  );
}

/**
 * Marca la tienda como sincronizada con la procedencia REAL de los datos, no
 * con el modo del script: es lo único que permite que la UI no presente datos
 * sintéticos como reales.
 */
export async function touchStoreSync(
  storeId: number,
  source: "live" | "sample",
): Promise<void> {
  await query(`UPDATE stores SET last_synced_at = now(), data_source = $2 WHERE id = $1`, [
    storeId,
    source,
  ]);
}

export async function listStoreRows(): Promise<StoreRow[]> {
  return query<StoreRow>(
    `SELECT id, slug, name, url, city, source_type AS "sourceType",
            source_config AS "sourceConfig", active, last_synced_at AS "lastSyncedAt"
     FROM stores ORDER BY name`,
  );
}

// ---------------------------------------------------------------------------
// Lectura (app)
// ---------------------------------------------------------------------------

const CARD_SUMMARY_SELECT = `
  SELECT c.id, c.name, c.slug, c.game_id AS "gameId", c.image_url AS "imageUrl",
         c.type_line AS "typeLine",
         COUNT(l.id)::int AS "listingCount",
         COUNT(DISTINCT l.store_id)::int AS "storeCount",
         MIN(CASE WHEN l.in_stock THEN l.price_cents END)::int AS "minPriceCents",
         MAX(CASE WHEN l.in_stock THEN l.price_cents END)::int AS "maxPriceCents",
         COUNT(*) FILTER (WHERE l.in_stock)::int AS "inStockCount"
  FROM cards c
  LEFT JOIN printings p ON p.card_id = c.id
  LEFT JOIN listings l ON l.printing_id = p.id
`;

/** "sol ring" -> 'sol:* & ring:*', que es el prefijo por palabra de FTS5. */
function toTsQuery(q: string): string | null {
  const tokens = normalizeText(q).split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

export async function searchCards(
  q: string,
  { limit = 40, onlyInStock = false }: { limit?: number; onlyInStock?: boolean } = {},
): Promise<CardSummary[]> {
  const ts = toTsQuery(q);
  if (!ts) return [];
  const having = onlyInStock ? `HAVING COUNT(*) FILTER (WHERE l.in_stock) > 0` : "";

  const byPrefix = await query<CardSummary>(
    `${CARD_SUMMARY_SELECT}
     WHERE c.name_ts @@ to_tsquery('simple', $1)
     GROUP BY c.id
     ${having}
     ORDER BY (COUNT(*) FILTER (WHERE l.in_stock) > 0) DESC, length(c.name), c.name
     LIMIT $2`,
    [ts, limit],
  );
  if (byPrefix.length) return byPrefix;

  // Sin coincidencia por prefijo, toleramos errores de dedo con trigramas.
  return query<CardSummary>(
    `${CARD_SUMMARY_SELECT}
     WHERE c.match_key % $1
     GROUP BY c.id, c.match_key
     ${having}
     ORDER BY similarity(c.match_key, $1) DESC, c.name
     LIMIT $2`,
    [normalizeText(q), limit],
  );
}

export async function getCardBySlug(slug: string): Promise<CardSummary | null> {
  return one<CardSummary>(`${CARD_SUMMARY_SELECT} WHERE c.slug = $1 GROUP BY c.id`, [slug]);
}

export interface ListingFilters {
  onlyInStock?: boolean;
  storeSlugs?: string[];
  conditions?: string[];
  finish?: Finish | "all";
  language?: string | "all";
  sort?: "price_asc" | "price_desc" | "store" | "cercania";
}

export async function getListingsForCard(
  cardId: number,
  filters: ListingFilters = {},
): Promise<ListingRow[]> {
  const where: string[] = ["p.card_id = $1"];
  const params: unknown[] = [cardId];
  const add = (v: unknown) => `$${params.push(v)}`;

  if (filters.onlyInStock) where.push("l.in_stock");
  if (filters.storeSlugs?.length) where.push(`s.slug = ANY(${add(filters.storeSlugs)}::text[])`);
  if (filters.conditions?.length) where.push(`l.condition = ANY(${add(filters.conditions)}::text[])`);
  if (filters.finish && filters.finish !== "all") where.push(`p.finish = ${add(filters.finish)}`);
  if (filters.language && filters.language !== "all") where.push(`p.language = ${add(filters.language)}`);

  // 'cercania' no se ordena en SQL: el criterio (misma ciudad antes que
  // kilómetros) vive en src/lib/location.ts y se aplica donde se conoce al usuario.
  const order =
    filters.sort === "price_desc"
      ? "l.in_stock DESC, l.price_cents DESC"
      : filters.sort === "price_asc"
        ? "l.in_stock DESC, l.price_cents ASC"
        : "l.in_stock DESC, s.name ASC, l.price_cents ASC";

  return query<ListingRow>(
    `SELECT l.id, l.price_cents AS "priceCents", l.currency, l.condition, l.stock,
            l.in_stock AS "inStock", l.product_url AS "productUrl",
            l.raw_title AS "rawTitle", l.updated_at AS "updatedAt", l.origin,
            p.set_name AS "setName", p.set_code AS "setCode",
            p.collector_number AS "collectorNumber", p.language, p.finish,
            p.image_url AS "printingImage",
            s.id AS "storeId", s.name AS "storeName", s.slug AS "storeSlug",
            s.url AS "storeUrl", s.city AS "storeCity",
            s.lat AS "storeLat", s.lng AS "storeLng",
            s.data_source AS "storeDataSource",
            se.name AS "sellerName", se.type AS "sellerType"
     FROM listings l
     JOIN printings p ON p.id = l.printing_id
     JOIN stores s ON s.id = l.store_id
     JOIN sellers se ON se.id = l.seller_id
     WHERE ${where.join(" AND ")}
     ORDER BY ${order}`,
    params,
  );
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
  dataSource: "live" | "sample";
  lastSyncedAt: string | null;
  listingCount: number;
  inStockCount: number;
  cardCount: number;
  affiliateCount: number;
}

export async function listStoresPublic(): Promise<StorePublic[]> {
  return query<StorePublic>(
    `SELECT s.id, s.slug, s.name, s.url, s.city, s.lat, s.lng,
            s.source_type AS "sourceType", s.data_source AS "dataSource",
            s.last_synced_at AS "lastSyncedAt",
            COUNT(l.id)::int AS "listingCount",
            COUNT(*) FILTER (WHERE l.in_stock)::int AS "inStockCount",
            COUNT(DISTINCT p.card_id)::int AS "cardCount",
            (SELECT COUNT(*)::int FROM sellers se
              WHERE se.store_id = s.id AND se.type = 'affiliate' AND se.active) AS "affiliateCount"
     FROM stores s
     LEFT JOIN listings l ON l.store_id = s.id
     LEFT JOIN printings p ON p.id = l.printing_id
     WHERE s.active
     GROUP BY s.id
     ORDER BY "inStockCount" DESC, s.name`,
  );
}

export interface GamePublic {
  id: string;
  name: string;
  cardCount: number;
  inStockCount: number;
}

export async function listGames(): Promise<GamePublic[]> {
  return query<GamePublic>(
    `SELECT g.id, g.name,
            COUNT(DISTINCT c.id)::int AS "cardCount",
            COUNT(*) FILTER (WHERE l.in_stock)::int AS "inStockCount"
     FROM games g
     LEFT JOIN cards c ON c.game_id = g.id
     LEFT JOIN printings p ON p.card_id = c.id
     LEFT JOIN listings l ON l.printing_id = p.id
     GROUP BY g.id
     ORDER BY "inStockCount" DESC, g.name`,
  );
}

export interface Stats {
  stores: number;
  cards: number;
  listings: number;
  inStock: number;
  lastSyncedAt: string | null;
}

export async function getStats(): Promise<Stats> {
  const row = await one<Stats>(
    `SELECT (SELECT COUNT(*)::int FROM stores WHERE active) AS stores,
            (SELECT COUNT(*)::int FROM cards) AS cards,
            (SELECT COUNT(*)::int FROM listings) AS listings,
            (SELECT COUNT(*)::int FROM listings WHERE in_stock) AS "inStock",
            (SELECT MAX(last_synced_at) FROM stores) AS "lastSyncedAt"`,
  );
  return row!;
}

/** Ranking de respaldo: en cuántas tiendas está la carta. */
export async function getTopCardsBySupply(limit = 5): Promise<CardSummary[]> {
  return query<CardSummary>(
    `${CARD_SUMMARY_SELECT}
     GROUP BY c.id
     HAVING COUNT(*) FILTER (WHERE l.in_stock) > 0
     ORDER BY COUNT(DISTINCT l.store_id) DESC, COUNT(l.id) DESC, c.name
     LIMIT $1`,
    [limit],
  );
}

/** Hidrata cartas por slug conservando el orden pedido y descartando sin stock. */
export async function getCardsBySlugs(slugs: string[]): Promise<CardSummary[]> {
  if (!slugs.length) return [];
  const rows = await query<CardSummary>(
    `${CARD_SUMMARY_SELECT}
     WHERE c.slug = ANY($1::text[])
     GROUP BY c.id
     HAVING COUNT(*) FILTER (WHERE l.in_stock) > 0`,
    [slugs],
  );
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return slugs.map((s) => bySlug.get(s)).filter((c): c is CardSummary => !!c);
}

/** Guarda de la API de eventos: no aceptamos slugs que no existen. */
export async function cardExists(slug: string): Promise<boolean> {
  return (await one(`SELECT 1 FROM cards WHERE slug = $1`, [slug])) !== null;
}

export interface Provenance {
  live: number;
  sample: number;
  sampleNames: string[];
}

/**
 * De dónde salen los datos que se muestran, tienda por tienda. Un booleano
 * global mentía en los dos sentidos.
 */
export async function getProvenance(): Promise<Provenance> {
  const rows = await query<{ dataSource: string; name: string }>(
    `SELECT data_source AS "dataSource", name FROM stores WHERE active ORDER BY name`,
  );
  const sampleNames = rows.filter((r) => r.dataSource !== "live").map((r) => r.name);
  return { live: rows.length - sampleNames.length, sample: sampleNames.length, sampleNames };
}

// ---------------------------------------------------------------------------
// Búsqueda por lista (decklist)
// ---------------------------------------------------------------------------

export async function findCardByName(name: string): Promise<CardSummary | null> {
  const matchKey = normalizeText(name);
  if (!matchKey) return null;

  const exact = await one<CardSummary>(
    `${CARD_SUMMARY_SELECT} WHERE c.match_key = $1 GROUP BY c.id`,
    [matchKey],
  );
  if (exact) return exact;

  return (await searchCards(name, { limit: 1 }))[0] ?? null;
}

export interface CardStorePrice {
  cardId: number;
  storeId: number;
  storeSlug: string;
  storeName: string;
  storeCity: string | null;
  storeLat: number | null;
  storeLng: number | null;
  priceCents: number;
}

/** Precio más barato con stock de cada carta en cada tienda. */
export async function getCheapestByCardAndStore(
  cardIds: number[],
): Promise<CardStorePrice[]> {
  if (!cardIds.length) return [];
  return query<CardStorePrice>(
    `SELECT p.card_id AS "cardId", s.id AS "storeId", s.slug AS "storeSlug",
            s.name AS "storeName", s.city AS "storeCity",
            s.lat AS "storeLat", s.lng AS "storeLng",
            MIN(l.price_cents)::int AS "priceCents"
     FROM listings l
     JOIN printings p ON p.id = l.printing_id
     JOIN stores s ON s.id = l.store_id
     WHERE l.in_stock AND p.card_id = ANY($1::int[])
     GROUP BY p.card_id, s.id`,
    [cardIds],
  );
}

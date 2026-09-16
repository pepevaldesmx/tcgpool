-- ---------------------------------------------------------------------------
-- TCG Pool — esquema (PostgreSQL)
--
-- Jerarquía de datos (importante, no colapsar niveles):
--   card      -> la carta "abstracta" ("Lightning Bolt")
--   printing  -> una impresión concreta (set + número + idioma + foil)
--   listing   -> lo que un vendedor concreto tiene a la venta de esa impresión
--
-- El vendedor (`sellers`) está separado de la tienda (`stores`) para que los
-- afiliados —jugadores que venden avalados por una tienda— no requieran
-- rediseñar el modelo: un listing de afiliado apunta al mismo `store_id` que lo
-- despacha, así que los conteos por tienda ya los incluyen solos.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS games (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id               SERIAL PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  url              TEXT NOT NULL,
  city             TEXT,
  -- Centro de la ciudad, para ordenar por cercanía. No es la dirección.
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  source_type      TEXT NOT NULL,
  source_config    JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_game     TEXT REFERENCES games(id),
  ships_nationwide BOOLEAN NOT NULL DEFAULT TRUE,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  -- 'live' = se ingirió el feed real; 'sample' = datos sintéticos.
  data_source      TEXT NOT NULL DEFAULT 'sample',
  last_synced_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sellers (
  id        SERIAL PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  -- 'store' | 'affiliate' (jugador avalado por una tienda)
  type      TEXT NOT NULL DEFAULT 'store',
  store_id  INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  active    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_sellers_store ON sellers(store_id);

CREATE TABLE IF NOT EXISTS cards (
  id         SERIAL PRIMARY KEY,
  game_id    TEXT NOT NULL REFERENCES games(id),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  -- minúsculas, sin acentos ni puntuación: la llave de deduplicación y de
  -- búsqueda. Se calcula en JS (normalizeText) para no depender de `unaccent`,
  -- que no todos los Postgres administrados traen.
  match_key  TEXT NOT NULL,
  oracle_id  TEXT,
  image_url  TEXT,
  type_line  TEXT,
  -- Prefijo por palabra, que es lo que hacía FTS5 en SQLite. 'simple' no
  -- necesita diccionario de idioma: los nombres de carta son en inglés.
  name_ts    tsvector GENERATED ALWAYS AS (to_tsvector('simple', match_key)) STORED,
  UNIQUE (game_id, match_key)
);

CREATE INDEX IF NOT EXISTS idx_cards_slug ON cards(slug);
CREATE INDEX IF NOT EXISTS idx_cards_ts ON cards USING GIN (name_ts);
-- Trigramas para tolerar errores de dedo ("counterspel").
CREATE INDEX IF NOT EXISTS idx_cards_trgm ON cards USING GIN (match_key gin_trgm_ops);

CREATE TABLE IF NOT EXISTS printings (
  id               SERIAL PRIMARY KEY,
  card_id          INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  set_code         TEXT,
  set_name         TEXT,
  collector_number TEXT,
  language         TEXT NOT NULL DEFAULT 'en',
  finish           TEXT NOT NULL DEFAULT 'nonfoil',
  scryfall_id      TEXT,
  image_url        TEXT,
  match_key        TEXT NOT NULL,
  UNIQUE (card_id, match_key)
);

CREATE INDEX IF NOT EXISTS idx_printings_card ON printings(card_id);

CREATE TABLE IF NOT EXISTS listings (
  id            SERIAL PRIMARY KEY,
  printing_id   INTEGER NOT NULL REFERENCES printings(id) ON DELETE CASCADE,
  seller_id     INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  store_id      INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  price_cents   INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'MXN',
  condition     TEXT NOT NULL DEFAULT 'UNKNOWN',
  stock         INTEGER NOT NULL DEFAULT 0,
  in_stock      BOOLEAN NOT NULL DEFAULT FALSE,
  product_url   TEXT NOT NULL,
  raw_title     TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  -- De dónde salió este listing. CRÍTICO ahora que las tiendas administran su
  -- inventario: la sincronización sólo puede tocar lo que vino del feed. Si
  -- barriera todo, cada corrida borraría lo que la tienda capturó a mano o lo
  -- que subió un afiliado.
  origin        TEXT NOT NULL DEFAULT 'feed',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_listings_printing ON listings(printing_id);
CREATE INDEX IF NOT EXISTS idx_listings_store ON listings(store_id);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_id);
-- La consulta más común: listings con stock de una carta.
CREATE INDEX IF NOT EXISTS idx_listings_instock ON listings(printing_id) WHERE in_stock;

CREATE TABLE IF NOT EXISTS sync_runs (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  source            TEXT NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  status            TEXT NOT NULL,
  products_seen     INTEGER NOT NULL DEFAULT 0,
  listings_upserted INTEGER NOT NULL DEFAULT 0,
  listings_skipped  INTEGER NOT NULL DEFAULT 0,
  error             TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_store ON sync_runs(store_id, started_at DESC);

-- Señales de demanda: qué se ve y qué se clickea hacia la tienda. Se llavea por
-- slug de carta, no por id, para sobrevivir a recargas del catálogo.
CREATE TABLE IF NOT EXISTS card_events (
  card_slug TEXT    NOT NULL,
  day       DATE    NOT NULL,
  kind      TEXT    NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (card_slug, day, kind)
);

CREATE INDEX IF NOT EXISTS idx_card_events_day ON card_events(day);

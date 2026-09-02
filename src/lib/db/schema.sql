-- ---------------------------------------------------------------------------
-- TCG Comparador MX — esquema
--
-- Jerarquía de datos (importante, no colapsar niveles):
--   card      -> la carta "abstracta" ("Lightning Bolt")
--   printing  -> una impresión concreta (set + número + idioma + foil)
--   listing   -> lo que un vendedor concreto tiene a la venta de esa impresión
--
-- El vendedor (`sellers`) ya está separado de la tienda (`stores`) para que la
-- fase 2 (afiliados avalados por una tienda) no requiera rediseñar el modelo:
-- hoy todo listing viene de un seller de tipo 'store', mañana puede venir de
-- uno de tipo 'affiliate' cuyo `store_id` es la tienda que lo avala y le da
-- logística.
-- ---------------------------------------------------------------------------

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS games (
  id    TEXT PRIMARY KEY,          -- 'magic' | 'pokemon' | 'yugioh' | ...
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  url            TEXT NOT NULL,
  city           TEXT,
  -- Coordenadas APROXIMADAS (centro de la ciudad), sólo para ordenar tiendas
  -- por cercanía. No son la dirección de la tienda.
  lat            REAL,
  lng            REAL,
  -- 'shopify' | 'manual' | 'wix' | ...  -> decide qué adaptador de ingesta usar
  source_type    TEXT NOT NULL,
  source_config  TEXT NOT NULL DEFAULT '{}',   -- JSON con lo específico del adaptador
  ships_nationwide INTEGER NOT NULL DEFAULT 1,
  active         INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS sellers (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  slug      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  -- 'store' (fase 1) | 'affiliate' (fase 2, jugador avalado por una tienda)
  type      TEXT NOT NULL DEFAULT 'store',
  -- tienda dueña del inventario (type='store') o tienda avaladora (type='affiliate')
  store_id  INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    TEXT NOT NULL REFERENCES games(id),
  name       TEXT NOT NULL,          -- nombre canónico ("Lightning Bolt")
  slug       TEXT NOT NULL,          -- "lightning-bolt"
  -- nombre normalizado (minúsculas, sin acentos ni puntuación) para matching
  match_key  TEXT NOT NULL,
  oracle_id  TEXT,                   -- id estable de Scryfall (magic)
  image_url  TEXT,
  type_line  TEXT,
  UNIQUE (game_id, match_key)
);

CREATE INDEX IF NOT EXISTS idx_cards_slug ON cards(slug);

CREATE TABLE IF NOT EXISTS printings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id          INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  set_code         TEXT,
  set_name         TEXT,
  collector_number TEXT,
  language         TEXT NOT NULL DEFAULT 'en',        -- 'en' | 'es' | 'jp' | ...
  finish           TEXT NOT NULL DEFAULT 'nonfoil',   -- 'nonfoil' | 'foil' | 'etched'
  scryfall_id      TEXT,
  image_url        TEXT,
  -- clave de deduplicación: set + número + idioma + acabado
  match_key        TEXT NOT NULL,
  UNIQUE (card_id, match_key)
);

CREATE INDEX IF NOT EXISTS idx_printings_card ON printings(card_id);

CREATE TABLE IF NOT EXISTS listings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  printing_id     INTEGER NOT NULL REFERENCES printings(id) ON DELETE CASCADE,
  seller_id       INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  -- tienda que despacha (hoy = la del seller; en fase 2, la avaladora)
  store_id        INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  price_cents     INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'MXN',
  condition       TEXT NOT NULL DEFAULT 'UNKNOWN',   -- NM | LP | MP | HP | DMG | SEALED | UNKNOWN
  stock           INTEGER NOT NULL DEFAULT 0,
  in_stock        INTEGER NOT NULL DEFAULT 0,
  product_url     TEXT NOT NULL,
  raw_title       TEXT NOT NULL,      -- título tal cual venía del feed (auditoría)
  -- id del listing en la fuente (variant id de Shopify, etc.) para upsert idempotente
  external_id     TEXT NOT NULL,
  first_seen_at   TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (store_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_listings_printing ON listings(printing_id);
CREATE INDEX IF NOT EXISTS idx_listings_store ON listings(store_id);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price_cents);

-- Bitácora de sincronizaciones: qué tienda, cuándo, cuántos listings.
CREATE TABLE IF NOT EXISTS sync_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id      INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  source        TEXT NOT NULL,        -- 'live' | 'sample'
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  status        TEXT NOT NULL,        -- 'ok' | 'error'
  products_seen INTEGER NOT NULL DEFAULT 0,
  listings_upserted INTEGER NOT NULL DEFAULT 0,
  listings_skipped  INTEGER NOT NULL DEFAULT 0,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_store ON sync_runs(store_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- Señales de demanda: qué se busca y qué se clickea hacia la tienda.
--
-- "De moda" de verdad son las más buscadas. Eso se llena en RUNTIME, y hoy la
-- base es de sólo lectura (filesystem inmutable de la función serverless), así
-- que esta tabla se queda vacía hasta que exista un almacén escribible. Mientras
-- tanto `getTrendingCards` cae al ranking de oferta y la UI lo dice.
--
-- La compra no la podemos medir: en fase 1 el checkout ocurre en la tienda y
-- nunca vemos la venta. El proxy medible es el clic de salida ('clickout').
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS card_events (
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  day     TEXT NOT NULL,                -- YYYY-MM-DD
  kind    TEXT NOT NULL,                -- 'search' | 'clickout'
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (card_id, day, kind)
);

CREATE INDEX IF NOT EXISTS idx_card_events_day ON card_events(day);

-- Búsqueda por nombre. FTS5 con prefijos para autocomplete.
CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
  name,
  content='cards',
  content_rowid='id',
  tokenize="unicode61 remove_diacritics 2",
  prefix='2 3 4'
);

CREATE TRIGGER IF NOT EXISTS cards_ai AFTER INSERT ON cards BEGIN
  INSERT INTO cards_fts(rowid, name) VALUES (new.id, new.name);
END;
CREATE TRIGGER IF NOT EXISTS cards_ad AFTER DELETE ON cards BEGIN
  INSERT INTO cards_fts(cards_fts, rowid, name) VALUES ('delete', old.id, old.name);
END;
CREATE TRIGGER IF NOT EXISTS cards_au AFTER UPDATE ON cards BEGIN
  INSERT INTO cards_fts(cards_fts, rowid, name) VALUES ('delete', old.id, old.name);
  INSERT INTO cards_fts(rowid, name) VALUES (new.id, new.name);
END;

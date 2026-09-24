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
  last_synced_at   TIMESTAMPTZ,
  -- Llave del panel de la tienda. Sin cuentas todavía: quien tiene el link
  -- entra. Se regenera cambiando este valor.
  panel_token      TEXT UNIQUE
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

-- ---------------------------------------------------------------------------
-- Conflictos entre lo que la tienda capturó a mano y lo que dice su Shopify.
--
-- La importación NO pisa lo capturado a mano: cuando el feed trae la misma
-- impresión, en la misma condición, que un listado manual de esa tienda, el
-- listado manual se queda tal cual y el valor del feed se guarda aquí como
-- advertencia. La tienda decide caso por caso cuál gana.
--
-- Mientras el conflicto está pendiente, la fila del feed NO entra a `listings`:
-- si entrara, la misma carta de la misma tienda aparecería dos veces en el
-- buscador, con dos precios distintos.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_conflicts (
  id               SERIAL PRIMARY KEY,
  store_id         INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  printing_id      INTEGER NOT NULL REFERENCES printings(id) ON DELETE CASCADE,
  -- El listado manual que hoy está publicado y que el feed contradice. Si ese
  -- listado desaparece —porque la tienda decidió que gana el feed— el registro
  -- de la decisión se queda: es la bitácora de quién resolvió qué.
  listing_id       INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  -- Lo que el feed propone, tal como llegó.
  feed_external_id TEXT NOT NULL,
  feed_price_cents INTEGER NOT NULL,
  feed_condition   TEXT NOT NULL,
  feed_stock       INTEGER NOT NULL,
  feed_in_stock    BOOLEAN NOT NULL,
  feed_product_url TEXT NOT NULL,
  feed_raw_title   TEXT NOT NULL,
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ,
  -- 'feed' = gana Shopify; 'manual' = se queda lo capturado.
  resolution       TEXT,
  -- Una advertencia viva por producto del feed: si el feed vuelve a traer lo
  -- mismo, se actualiza en vez de acumular filas.
  UNIQUE (store_id, feed_external_id)
);

CREATE INDEX IF NOT EXISTS idx_conflicts_pending
  ON listing_conflicts(store_id) WHERE resolved_at IS NULL;

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

-- ---------------------------------------------------------------------------
-- Migraciones incrementales
--
-- `CREATE TABLE IF NOT EXISTS` no agrega columnas a una tabla que ya existe, y
-- este archivo se corre sobre bases con datos. Todo lo que se sume después de
-- la primera versión de una tabla va aquí, en forma idempotente.
-- ---------------------------------------------------------------------------
ALTER TABLE stores ADD COLUMN IF NOT EXISTS panel_token TEXT UNIQUE;

-- La bitácora de conflictos sobrevive al listado que los originó.
ALTER TABLE listing_conflicts
  DROP CONSTRAINT IF EXISTS listing_conflicts_listing_id_fkey;
ALTER TABLE listing_conflicts
  ADD CONSTRAINT listing_conflicts_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;

-- ===========================================================================
-- PLATAFORMA: cuentas, comandas, wishlist, dinero, logística, conectores
--
-- Todo lo de aquí abajo es ADITIVO a propósito. El catálogo y la ingesta
-- siguen corriendo en producción contra las tablas de arriba mientras el código
-- migra; quitar `stores.panel_token` o `stores.source_type` el mismo día que se
-- agregan sus reemplazos dejaría el sitio muerto entre un deploy y el otro.
-- Se retiran cuando el código deje de leerlos, no antes.
--
-- Nota de vocabulario: las tablas del catálogo están en inglés y éstas dicen
-- `comandas`. No es descuido: una comanda no es un "order" —existe antes del
-- pago, se arma sola, cambia de fuentes y se parte en varias entregas— y es la
-- palabra con la que se habla del producto.
-- ===========================================================================

-- --- Cuentas ---------------------------------------------------------------
--
-- Los roles son RELACIONES, no una columna: el dueño de una tienda también
-- compra cartas, y un afiliado también busca. Con "tipo de usuario" como campo,
-- esa persona necesitaría dos cuentas y dos correos.
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  -- Id del proveedor de identidad, si el login termina siendo externo.
  auth_id    TEXT UNIQUE,
  name       TEXT,
  phone      TEXT,
  is_admin   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Único por correo sin importar mayúsculas: Pepe@ y pepe@ son la misma persona.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));

CREATE TABLE IF NOT EXISTS memberships (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id  INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  -- 'owner' administra; 'operator' captura inventario.
  role       TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, seller_id)
);

CREATE TABLE IF NOT EXISTS addresses (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT,
  line1       TEXT NOT NULL,
  line2       TEXT,
  city        TEXT NOT NULL,
  state       TEXT,
  postal_code TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

-- --- Logística -------------------------------------------------------------
--
-- La corrida es una entidad propia y no un campo de la comanda, porque UNA
-- corrida junta VARIAS comandas. De ahí salen los $50: el mensajero recorre las
-- mismas tiendas una vez y el costo se reparte. Sin agrupar, la primera comanda
-- del día paga la corrida entera.
CREATE TABLE IF NOT EXISTS runs (
  id            SERIAL PRIMARY KEY,
  city          TEXT NOT NULL,
  scheduled_for DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'programada',
  courier       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city, scheduled_for)
);

CREATE TABLE IF NOT EXISTS run_stops (
  id       SERIAL PRIMARY KEY,
  run_id   INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  status   TEXT NOT NULL DEFAULT 'pendiente',
  UNIQUE (run_id, store_id)
);

-- --- Comanda ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comandas (
  id       SERIAL PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- abierta | pagada | en_preparacion | lista | entregada | cancelada | expirada
  status   TEXT NOT NULL DEFAULT 'abierta',
  city     TEXT,
  -- recoger_en_cada_tienda (gratis) | consolidar_y_recoger | envio_directo |
  -- consolidar_y_enviar
  delivery TEXT NOT NULL DEFAULT 'recoger_en_cada_tienda',
  pickup_store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
  address_id      INTEGER REFERENCES addresses(id) ON DELETE SET NULL,
  run_id          INTEGER REFERENCES runs(id) ON DELETE SET NULL,

  -- Cada componente por separado: el usuario tiene derecho a ver de qué se
  -- compone el total, y la liquidación a cada vendedor se calcula del subtotal,
  -- nunca del total.
  subtotal_cents      INTEGER NOT NULL DEFAULT 0,
  consolidation_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents      INTEGER NOT NULL DEFAULT 0,
  commission_cents    INTEGER NOT NULL DEFAULT 0,
  processing_cents    INTEGER NOT NULL DEFAULT 0,
  total_cents         INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una comanda sin pagar se libera: si no, se acumulan comandas fantasma que
  -- ensucian cualquier medición de demanda.
  expires_at TIMESTAMPTZ,
  paid_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_comandas_user ON comandas(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comandas_run ON comandas(run_id) WHERE run_id IS NOT NULL;

-- El renglón guarda COPIA del nombre, la condición y el precio. El listado
-- original puede desaparecer entre que se arma la comanda y que se paga —de
-- hecho es lo normal—, y una comanda tiene que poder leerse dos años después.
CREATE TABLE IF NOT EXISTS comanda_lines (
  id          SERIAL PRIMARY KEY,
  comanda_id  INTEGER NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  listing_id  INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  printing_id INTEGER REFERENCES printings(id) ON DELETE SET NULL,
  seller_id   INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
  store_id    INTEGER REFERENCES stores(id) ON DELETE SET NULL,

  card_name   TEXT NOT NULL,
  set_name    TEXT,
  condition   TEXT NOT NULL,
  language    TEXT,
  finish      TEXT,
  unit_price_cents INTEGER NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 1,
  -- confirmada | perdida | reemplazada | removida
  status      TEXT NOT NULL DEFAULT 'confirmada',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comanda_lines_comanda ON comanda_lines(comanda_id);

-- --- Wishlist --------------------------------------------------------------
--
-- Vive por su cuenta, no colgada de una comanda: se alimenta de búsquedas que
-- no dieron nada Y de lo que fue quedando pendiente de varias comandas.
-- Cualquier impresión de la carta dispara el aviso: quien quiere una carta la
-- quiere como sea.
CREATE TABLE IF NOT EXISTS wishlist_items (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  -- 'busqueda' y 'comanda' son intensidades de deseo distintas: lo intentó
  -- comprar tres veces no es lo mismo que lo buscó una vez.
  source      TEXT NOT NULL DEFAULT 'busqueda',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ
);

-- Un solo deseo VIVO por carta y usuario: se avisa UNA vez y el renglón se
-- cierra. Si la sigue queriendo, la vuelve a pedir. Un correo cada ocho días
-- por la misma carta es un correo que nadie abre.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlist_vivo
  ON wishlist_items (user_id, card_id) WHERE notified_at IS NULL;

-- --- Dinero ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id           SERIAL PRIMARY KEY,
  comanda_id   INTEGER NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,
  provider_ref TEXT,
  amount_cents INTEGER NOT NULL,
  fee_cents    INTEGER NOT NULL DEFAULT 0,
  -- pendiente | pagado | fallido | reembolsado
  status       TEXT NOT NULL DEFAULT 'pendiente',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- El webhook del proveedor llega más de una vez: sin esto, un reintento suyo
  -- se convierte en un cobro duplicado.
  UNIQUE (provider, provider_ref)
);

-- Lo que se le paga a cada vendedor de una comanda. Las retenciones son cero
-- para una tienda que factura por su cuenta, y no para un afiliado: una
-- plataforma que cobra por cuenta de personas físicas retiene ISR e IVA.
CREATE TABLE IF NOT EXISTS payouts (
  id               SERIAL PRIMARY KEY,
  seller_id        INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  comanda_id       INTEGER REFERENCES comandas(id) ON DELETE SET NULL,
  gross_cents      INTEGER NOT NULL,
  processing_cents INTEGER NOT NULL DEFAULT 0,
  commission_cents INTEGER NOT NULL DEFAULT 0,
  isr_cents        INTEGER NOT NULL DEFAULT 0,
  iva_cents        INTEGER NOT NULL DEFAULT 0,
  net_cents        INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pendiente',
  cfdi_uuid        TEXT,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_seller ON payouts(seller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shipments (
  id            SERIAL PRIMARY KEY,
  comanda_id    INTEGER NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  from_city     TEXT NOT NULL,
  to_address_id INTEGER REFERENCES addresses(id) ON DELETE SET NULL,
  cost_cents    INTEGER NOT NULL DEFAULT 0,
  carrier       TEXT,
  tracking      TEXT,
  status        TEXT NOT NULL DEFAULT 'pendiente',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- Conectores ------------------------------------------------------------
--
-- Cuelgan del VENDEDOR, no de la tienda: un afiliado también tiene inventario
-- que sincronizar, y ManaBox es justo lo que usaría un jugador para escanear su
-- colección. Con el método en la tienda, el afiliado se queda sin herramientas.
CREATE TABLE IF NOT EXISTS connectors (
  id          SERIAL PRIMARY KEY,
  seller_id   INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  -- csv | shopify_publico | shopify_app | wix | api
  type        TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- REFERENCIA a la credencial, nunca la credencial. Un token de Shopify en
  -- texto plano en la base es un token filtrado el día del primer respaldo.
  secret_ref  TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connectors_seller ON connectors(seller_id) WHERE active;

-- --- Migraciones sobre tablas que ya existían ------------------------------
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS rfc TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS regimen_fiscal TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'activo';
ALTER TABLE stores  ADD COLUMN IF NOT EXISTS affiliation_terms TEXT;
-- Los afiliados también sincronizan, así que la bitácora deja de ser por tienda.
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS seller_id INTEGER
  REFERENCES sellers(id) ON DELETE CASCADE;

-- La carta, no sólo la impresión: cuando un renglón se pierde al pagar, lo que
-- se va a la wishlist es la CARTA —cualquier impresión dispara el aviso—, y sin
-- esto habría que recuperarla desde `printings`, que puede haber sido barrida.
ALTER TABLE comanda_lines ADD COLUMN IF NOT EXISTS card_id INTEGER
  REFERENCES cards(id) ON DELETE SET NULL;

-- UNA comanda abierta por persona. Es el carrito: dos pestañas armando listas
-- distintas crearían dos comandas, y cada una pagaría su propia corrida del
-- mensajero. Concentrar es justo lo que abarata la entrega.
CREATE UNIQUE INDEX IF NOT EXISTS idx_comanda_abierta
  ON comandas (user_id) WHERE status = 'abierta';

-- El mismo listado dos veces en la misma comanda es MÁS CANTIDAD, no otro
-- renglón: dos renglones de la misma fuente se pagarían y recogerían igual, y
-- sólo servirían para confundir el conteo. La misma carta desde DOS tiendas
-- distintas sí son dos renglones, y esta llave lo permite.
CREATE UNIQUE INDEX IF NOT EXISTS idx_comanda_lines_fuente
  ON comanda_lines (comanda_id, listing_id) WHERE listing_id IS NOT NULL;

import { Pool } from "pg";

/**
 * Señales de demanda (qué se ve y qué se clickea hacia la tienda).
 *
 * Vive en Postgres, no en SQLite, y por una razón dura: SQLite es el CATÁLOGO,
 * se reconstruye en cada build y en runtime se abre en sólo lectura. Los
 * contadores se escriben en runtime, así que necesitan un almacén aparte.
 *
 * Todo aquí degrada con gracia: sin `DATABASE_URL` la app funciona igual y el
 * home cae al ranking de oferta. Nunca tiramos una request por un contador.
 *
 * Se llavea por SLUG y no por id: los ids de SQLite se regeneran en cada
 * `db:build`, el slug es estable.
 *
 * Driver `pg` en vez del serverless de Neon: sirve con cualquier Postgres
 * (Neon, Vercel, Supabase) y se puede probar contra uno local. En serverless usa
 * la cadena de conexión *pooled* que da el proveedor.
 */

export type EventKind = "view" | "clickout";

function connectionString(): string | null {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    null
  );
}

export function isEventsStoreEnabled(): boolean {
  return connectionString() !== null;
}

let pool: Pool | null = null;

function getPool(): Pool | null {
  const url = connectionString();
  if (!url) return null;
  pool ??= new Pool({
    connectionString: url,
    // Una función serverless atiende una request a la vez: más conexiones sólo
    // gastarían el cupo del proveedor.
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    // Los Postgres administrados (Neon, Vercel, Supabase) exigen TLS y usan
    // certificados que el runtime no siempre trae en su almacén.
    ssl: url.includes("localhost") || url.includes("127.0.0.1")
      ? undefined
      : { rejectUnauthorized: false },
  });
  return pool;
}

export async function migrateEventsStore(): Promise<void> {
  const db = getPool();
  if (!db) throw new Error("Falta DATABASE_URL / POSTGRES_URL.");
  await db.query(`
    CREATE TABLE IF NOT EXISTS card_events (
      card_slug TEXT    NOT NULL,
      day       DATE    NOT NULL,
      kind      TEXT    NOT NULL,
      count     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (card_slug, day, kind)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_card_events_day ON card_events (day)`);
}

/** Suma uno al contador del día. Nunca lanza: un contador no rompe una página. */
export async function recordEvent(slug: string, kind: EventKind): Promise<void> {
  const db = getPool();
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO card_events (card_slug, day, kind, count)
       VALUES ($1, CURRENT_DATE, $2, 1)
       ON CONFLICT (card_slug, day, kind)
       DO UPDATE SET count = card_events.count + 1`,
      [slug, kind],
    );
  } catch (err) {
    console.error("[eventos] no se pudo registrar:", err);
  }
}

/**
 * Slugs más demandados en la ventana, de mayor a menor.
 *
 * Un clic de salida pesa el triple que una vista: la venta ocurre en la tienda
 * y nunca la vemos, así que ese clic es la intención de compra más cercana que
 * podemos observar.
 */
export async function getTopCardSlugs(limit = 5, windowDays = 14): Promise<string[]> {
  const db = getPool();
  if (!db) return [];
  try {
    const { rows } = await db.query<{ card_slug: string }>(
      `SELECT card_slug,
              SUM(CASE WHEN kind = 'clickout' THEN count * 3 ELSE count END) AS score
       FROM card_events
       WHERE day >= CURRENT_DATE - $1::int
       GROUP BY card_slug
       ORDER BY score DESC
       LIMIT $2`,
      [windowDays, limit],
    );
    return rows.map((r) => r.card_slug);
  } catch (err) {
    console.error("[eventos] no se pudo leer el ranking:", err);
    return [];
  }
}

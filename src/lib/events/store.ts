import { isConfigured, query } from "@/lib/db";

/**
 * Señales de demanda: qué se ve y qué se clickea hacia la tienda.
 *
 * Viven en la misma base que el catálogo, pero con otro ciclo de vida: se
 * escriben en cada request. Se llavean por SLUG de carta y no por id para
 * sobrevivir a una recarga completa del catálogo.
 *
 * Nada aquí tumba una página: un contador perdido no le importa a nadie.
 */

export type EventKind = "view" | "clickout";

export function isEventsStoreEnabled(): boolean {
  return isConfigured();
}

/** Suma uno al contador del día. */
export async function recordEvent(slug: string, kind: EventKind): Promise<void> {
  if (!isConfigured()) return;
  try {
    await query(
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
  if (!isConfigured()) return [];
  try {
    const rows = await query<{ card_slug: string }>(
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

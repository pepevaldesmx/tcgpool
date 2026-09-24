import { one, query } from "@/lib/db";

/**
 * SQL de la wishlist.
 *
 * Vive POR FUERA de la comanda: se alimenta de búsquedas sueltas y de los
 * pendientes de varias comandas, y sobrevive a todas ellas. Que ninguna tienda
 * tenga una carta no es una falla del sistema —las cartas vienen en sobres y el
 * inventario de una tienda es el azar de lo que abrió— así que "no la
 * conseguimos" no puede ser el final del camino.
 *
 * Dos reglas encodadas en el esquema, no en este código:
 *
 * - **Cualquier impresión dispara el aviso.** Cuando alguien quiere una carta,
 *   la quiere como sea; por eso la llave es `card_id` y no `printing_id`.
 * - **Se avisa UNA vez.** El índice único parcial
 *   `(user_id, card_id) WHERE notified_at IS NULL` deja UN pendiente vivo por
 *   carta, y una fila ya avisada no estorba: volver a agregarla crea otra, que
 *   es justo lo que significa "la sigo queriendo".
 */

export interface WishlistItem {
  id: number;
  cardId: number;
  cardName: string;
  cardSlug: string;
  imageUrl: string | null;
  source: string;
  createdAt: string;
  /** Tiendas donde se puede comprar HOY. Si es > 0, ya apareció. */
  storesNow: number;
  minPriceCents: number | null;
}

export async function addToWishlist(
  userId: number,
  cardIds: number[],
  source: "busqueda" | "comanda",
): Promise<number> {
  if (!cardIds.length) return 0;
  const rows = await query<{ id: number }>(
    `INSERT INTO wishlist_items (user_id, card_id, source)
     SELECT $1, id, $3 FROM unnest($2::int[]) AS id
     -- Ya pendiente = no se duplica. Ya avisada = sí entra otra vez, y eso es
     -- exactamente lo que significa volver a agregarla.
     ON CONFLICT (user_id, card_id) WHERE notified_at IS NULL DO NOTHING
     RETURNING id`,
    [userId, cardIds, source],
  );
  return rows.length;
}

export async function listWishlist(userId: number): Promise<WishlistItem[]> {
  return query<WishlistItem>(
    `SELECT w.id, w.card_id AS "cardId", c.name AS "cardName", c.slug AS "cardSlug",
            w.source, w.created_at AS "createdAt",
            (SELECT p.image_url FROM printings p
              WHERE p.card_id = c.id AND p.image_url IS NOT NULL LIMIT 1) AS "imageUrl",
            count(DISTINCT l.store_id)::int AS "storesNow",
            MIN(l.price_cents)::int AS "minPriceCents"
       FROM wishlist_items w
       JOIN cards c ON c.id = w.card_id
       LEFT JOIN printings p2 ON p2.card_id = c.id
       LEFT JOIN listings l ON l.printing_id = p2.id AND l.in_stock
      WHERE w.user_id = $1 AND w.notified_at IS NULL
      GROUP BY w.id, c.id
      ORDER BY w.created_at DESC`,
    [userId],
  );
}

export async function countWishlist(userId: number): Promise<number> {
  const row = await one<{ n: string }>(
    `SELECT count(*)::text AS n FROM wishlist_items
      WHERE user_id = $1 AND notified_at IS NULL`,
    [userId],
  );
  return Number.parseInt(row?.n ?? "0", 10);
}

export async function removeFromWishlist(userId: number, itemId: number): Promise<void> {
  await query(`DELETE FROM wishlist_items WHERE id = $1 AND user_id = $2`, [itemId, userId]);
}

export async function isInWishlist(userId: number, cardId: number): Promise<boolean> {
  const row = await one<{ id: number }>(
    `SELECT id FROM wishlist_items
      WHERE user_id = $1 AND card_id = $2 AND notified_at IS NULL`,
    [userId, cardId],
  );
  return row != null;
}

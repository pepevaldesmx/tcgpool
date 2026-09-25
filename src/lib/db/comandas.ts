import { one, query } from "@/lib/db";
import { agruparPorFuente } from "@/lib/comanda/armar";
import { desglosar, type Desglose, type Entrega } from "@/lib/comanda/money";
import type { SourceListing } from "@/lib/db/queries";

/**
 * SQL de la comanda: el grupo de cartas que el usuario va a comprar.
 *
 * Los renglones guardan COPIAS congeladas de lo que se eligió —nombre, set,
 * condición, precio unitario— y además el `listing_id` de la fuente. Las dos
 * cosas, no una: la copia es lo que el usuario vio y aceptó, y el listado es
 * contra lo que se vuelve a verificar al pagar. Si el renglón leyera el precio
 * del listado en cada vista, la tienda podría subirlo entre que el usuario armó
 * la comanda y que pagó, sin que nadie se enterara.
 */

export interface ComandaLine {
  id: number;
  listingId: number | null;
  printingId: number | null;
  cardId: number | null;
  cardName: string;
  cardSlug: string | null;
  setName: string | null;
  collectorNumber: string | null;
  imageUrl: string | null;
  condition: string;
  language: string | null;
  finish: string | null;
  unitPriceCents: number;
  qty: number;
  status: string;
  storeId: number | null;
  storeSlug: string | null;
  storeName: string | null;
  storeCity: string | null;
  /** Si la tienda todavía es de muestra, el renglón lo dice. */
  storeDataSource: string | null;
  sellerId: number | null;
  sellerName: string | null;
  /** 'store' | 'affiliate'. El comprador tiene derecho a saber de quién compra. */
  sellerType: string | null;
  /** Lo que la fuente tiene hoy. null = el listado ya no existe. */
  stockActual: number | null;
}

export interface Comanda {
  id: number;
  status: string;
  city: string | null;
  delivery: Entrega;
  pickupStoreId: number | null;
  lines: ComandaLine[];
  desglose: Desglose;
  /** Ciudades distintas de las que salen las cartas. Lo que cobra el envío. */
  ciudadesOrigen: number;
  /** Tiendas distintas del pedido. Lo que el plan intenta minimizar. */
  tiendas: number;
  /** Renglones de tiendas que todavía no se ingieren en vivo. */
  renglonesDemo: number;
  /** Renglones cuya fuente ya no alcanza para la cantidad pedida. */
  renglonesSinStock: number;
  /** Si no, `porQueNoSeCobra` dice qué falta. */
  cobrable: boolean;
  porQueNoSeCobra: string | null;
}

/**
 * ¿Se puede cobrar esta comanda?
 *
 * Un renglón de una tienda en muestra tiene precio y stock sintéticos: cobrarlo
 * sería vender una carta que no existe. La comanda SÍ se arma con ellos —es lo
 * que permite enseñarle el flujo completo a un dueño de tienda antes de que su
 * catálogo esté conectado— pero el cobro se detiene aquí, no en la conciencia de
 * quien opere la plataforma.
 */
function revisarCobro(lines: ComandaLine[]): {
  renglonesDemo: number;
  renglonesSinStock: number;
  cobrable: boolean;
  porQueNoSeCobra: string | null;
} {
  const renglonesDemo = lines.filter((l) => l.storeDataSource === "sample").length;
  const renglonesSinStock = lines.filter(
    (l) => l.stockActual == null || l.stockActual < l.qty,
  ).length;

  const porQueNoSeCobra =
    lines.length === 0
      ? "La comanda está vacía."
      : renglonesDemo > 0
        ? renglonesDemo === 1
          ? "Un renglón es de una tienda con catálogo de muestra: no se puede cobrar una carta cuyo precio y stock son sintéticos."
          : `${renglonesDemo} renglones son de tiendas con catálogo de muestra: no se puede cobrar una carta cuyo precio y stock son sintéticos.`
        : null;

  return {
    renglonesDemo,
    renglonesSinStock,
    cobrable: porQueNoSeCobra === null,
    porQueNoSeCobra,
  };
}

const LINE_SELECT = `
  SELECT cl.id, cl.listing_id AS "listingId", cl.printing_id AS "printingId",
         cl.card_id AS "cardId", cl.card_name AS "cardName",
         c.slug AS "cardSlug", cl.set_name AS "setName",
         p.collector_number AS "collectorNumber", p.image_url AS "imageUrl",
         cl.condition, cl.language, cl.finish,
         cl.unit_price_cents AS "unitPriceCents", cl.qty, cl.status,
         cl.store_id AS "storeId", st.slug AS "storeSlug", st.name AS "storeName",
         st.city AS "storeCity", st.data_source AS "storeDataSource",
         cl.seller_id AS "sellerId", se.name AS "sellerName", se.type AS "sellerType",
         CASE WHEN l.in_stock THEN l.stock ELSE 0 END AS "stockActual"
    FROM comanda_lines cl
    LEFT JOIN cards c ON c.id = cl.card_id
    LEFT JOIN printings p ON p.id = cl.printing_id
    LEFT JOIN stores st ON st.id = cl.store_id
    LEFT JOIN sellers se ON se.id = cl.seller_id
    LEFT JOIN listings l ON l.id = cl.listing_id`;

interface ComandaRow {
  id: number;
  status: string;
  city: string | null;
  delivery: string;
  pickup_store_id: number | null;
}

async function armar(row: ComandaRow): Promise<Comanda> {
  const lines = await query<ComandaLine>(
    `${LINE_SELECT} WHERE cl.comanda_id = $1 AND cl.status <> 'removida'
      ORDER BY st.name NULLS LAST, cl.card_name`,
    [row.id],
  );

  const subtotalCents = lines.reduce((n, l) => n + l.unitPriceCents * l.qty, 0);
  const ciudades = new Set(lines.map((l) => l.storeCity ?? "?"));
  const tiendas = new Set(lines.map((l) => l.storeId).filter((id) => id != null));
  const delivery = row.delivery as Entrega;

  return {
    id: row.id,
    status: row.status,
    city: row.city,
    delivery,
    pickupStoreId: row.pickup_store_id,
    lines,
    ciudadesOrigen: ciudades.size,
    tiendas: tiendas.size,
    ...revisarCobro(lines),
    desglose: desglosar({ subtotalCents, entrega: delivery, ciudadesOrigen: ciudades.size }),
  };
}

/** La comanda abierta de esta persona. Sólo puede haber una. */
export async function getOpenComanda(userId: number): Promise<Comanda | null> {
  const row = await one<ComandaRow>(
    `SELECT id, status, city, delivery, pickup_store_id
       FROM comandas WHERE user_id = $1 AND status = 'abierta'`,
    [userId],
  );
  return row ? armar(row) : null;
}

export async function getComandaById(id: number, userId: number): Promise<Comanda | null> {
  // El user_id va en el WHERE, no en una comprobación después: una comanda de
  // otra persona no debe ni leerse.
  const row = await one<ComandaRow>(
    `SELECT id, status, city, delivery, pickup_store_id
       FROM comandas WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return row ? armar(row) : null;
}

/** Cuántas copias trae la comanda abierta. Para el contador de la barra. */
export async function countOpenComandaCopies(userId: number): Promise<number> {
  const row = await one<{ n: string }>(
    `SELECT COALESCE(sum(cl.qty), 0)::text AS n
       FROM comandas co
       JOIN comanda_lines cl ON cl.comanda_id = co.id AND cl.status <> 'removida'
      WHERE co.user_id = $1 AND co.status = 'abierta'`,
    [userId],
  );
  return Number.parseInt(row?.n ?? "0", 10);
}

export async function ensureOpenComanda(userId: number, city: string | null): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO comandas (user_id, city)
     VALUES ($1, $2)
     -- El índice parcial de "una abierta por persona" es lo que hace esto
     -- seguro entre dos pestañas: la segunda recupera la de la primera.
     ON CONFLICT (user_id) WHERE status = 'abierta'
       DO UPDATE SET city = COALESCE(comandas.city, EXCLUDED.city)
     RETURNING id`,
    [userId, city],
  );
  return row!.id;
}

/**
 * Agrega fuentes concretas a la comanda.
 *
 * Por lotes y no una por una: una decklist de Commander son cien renglones, y
 * cien viajes de red contra una base remota se sienten.
 */
export async function addLines(
  comandaId: number,
  picks: { source: SourceListing; qty: number }[],
): Promise<number> {
  if (!picks.length) return 0;

  const unicos = agruparPorFuente(picks);

  const values: unknown[] = [];
  const tuplas = unicos.map((pick, i) => {
    const b = i * 13;
    const s = pick.source;
    values.push(
      comandaId,
      s.listingId,
      s.printingId,
      s.cardId,
      s.sellerId,
      s.storeId,
      s.cardName,
      s.setName,
      s.condition,
      s.language,
      s.finish,
      s.priceCents,
      // Nunca más copias de las que la fuente tiene: pedir cuatro de una de la
      // que hay una es una comanda que se rompe sola al pagar.
      Math.max(1, Math.min(pick.qty, s.stock || 1)),
    );
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7},
             $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12}, $${b + 13})`;
  });

  const rows = await query<{ id: number }>(
    `INSERT INTO comanda_lines
       (comanda_id, listing_id, printing_id, card_id, seller_id, store_id,
        card_name, set_name, condition, language, finish, unit_price_cents, qty)
     VALUES ${tuplas.join(", ")}
     -- Repetir la misma fuente es más cantidad, no otro renglón. El precio se
     -- refresca al de hoy: es el que el usuario está viendo al agregarla.
     -- Y la suma se topa al stock: sin el tope, apretar "Agregar" cinco veces
     -- dejaba una comanda de cinco copias de la única que hay.
     ON CONFLICT (comanda_id, listing_id) WHERE listing_id IS NOT NULL
       DO UPDATE SET qty = LEAST(
                       comanda_lines.qty + EXCLUDED.qty,
                       GREATEST(1, COALESCE((SELECT l.stock FROM listings l
                                              WHERE l.id = comanda_lines.listing_id
                                                AND l.in_stock), 1))),
                     unit_price_cents = EXCLUDED.unit_price_cents,
                     status = 'confirmada'
     RETURNING id`,
    values,
  );
  return rows.length;
}

export async function setLineQty(comandaId: number, lineId: number, qty: number): Promise<void> {
  if (qty <= 0) {
    await removeLine(comandaId, lineId);
    return;
  }
  // El techo es el stock de la fuente, leído en el momento: subir la cantidad a
  // diez cuando hay dos es una comanda que se rompe sola al pagar.
  await query(
    `UPDATE comanda_lines cl
        SET qty = LEAST($3, GREATEST(1, COALESCE(
              (SELECT l.stock FROM listings l WHERE l.id = cl.listing_id AND l.in_stock), 1)))
      WHERE cl.id = $2 AND cl.comanda_id = $1`,
    [comandaId, lineId, qty],
  );
}

export async function removeLine(comandaId: number, lineId: number): Promise<void> {
  // Se borra de verdad: un renglón que el usuario quitó de su carrito no es
  // historia que valga la pena, y dejarlo en 'removida' lo haría reaparecer en
  // cualquier consulta que olvidara filtrarlo.
  await query(`DELETE FROM comanda_lines WHERE id = $1 AND comanda_id = $2`, [lineId, comandaId]);
}

/** Cambia la fuente de un renglón por otra, conservando la cantidad. */
export async function changeLineSource(
  comandaId: number,
  lineId: number,
  source: SourceListing,
): Promise<void> {
  await query(
    `UPDATE comanda_lines
        SET listing_id = $3, printing_id = $4, seller_id = $5, store_id = $6,
            set_name = $7, condition = $8, language = $9, finish = $10,
            unit_price_cents = $11,
            qty = LEAST(qty, GREATEST(1, $12)),
            status = 'confirmada'
      WHERE id = $2 AND comanda_id = $1`,
    [
      comandaId,
      lineId,
      source.listingId,
      source.printingId,
      source.sellerId,
      source.storeId,
      source.setName,
      source.condition,
      source.language,
      source.finish,
      source.priceCents,
      source.stock,
    ],
  );
}

export async function setDelivery(
  comandaId: number,
  delivery: Entrega,
  pickupStoreId: number | null,
): Promise<void> {
  await query(
    `UPDATE comandas
        SET delivery = $2,
            -- La tienda de consolidación sólo significa algo si se consolida.
            -- El cast es necesario: sin él Postgres infiere el parámetro como
            -- texto y la columna es entera.
            pickup_store_id = CASE WHEN $2 IN ('consolidar_y_recoger', 'consolidar_y_enviar')
                                   THEN $3::int ELSE NULL END
      WHERE id = $1 AND status = 'abierta'`,
    [comandaId, delivery, pickupStoreId],
  );
}

/**
 * Congela el desglose en la comanda.
 *
 * Mientras está abierta se recalcula al leer, porque los renglones cambian. Se
 * ESCRIBE al cobrar: a partir de ahí el desglose es el comprobante de lo que se
 * cobró, y recalcularlo después contra precios nuevos lo falsearía.
 */
export async function freezeTotals(comandaId: number, d: Desglose): Promise<void> {
  await query(
    `UPDATE comandas
        SET subtotal_cents = $2, consolidation_cents = $3, shipping_cents = $4,
            commission_cents = $5, processing_cents = $6, total_cents = $7
      WHERE id = $1`,
    [
      comandaId,
      d.subtotalCents,
      d.consolidationCents,
      d.shippingCents,
      d.commissionCents,
      d.processingCents,
      d.totalCents,
    ],
  );
}

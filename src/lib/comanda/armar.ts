import { planFulfillment, type FulfillmentLine } from "@/lib/fulfillment";
import type { SourceListing } from "@/lib/db/queries";

/**
 * De una lista de cartas a las fuentes concretas de una comanda.
 *
 * Es el puente entre el plan de surtido —que razona en tiendas y precios— y la
 * comanda, que necesita listados concretos con condición y vendedor. La
 * separación importa: el plan decide EN QUÉ TIENDA, y aquí se elige CUÁL de sus
 * listados. Son dos preguntas distintas y colapsarlas hacía que el plan
 * prometiera un total y la comanda cobrara otro.
 *
 * Puro a propósito: se prueba sin base.
 */

export interface Pedido {
  /** Lo que el usuario escribió, para poder reportar lo que no se consiguió. */
  nombre: string;
  cardId: number | null;
  qty: number;
}

export interface Armado {
  picks: { source: SourceListing; qty: number }[];
  /** Lo que ninguna tienda tiene hoy. Va a la wishlist. */
  sinFuente: Pedido[];
  /** Tiendas distintas del plan. Lo que se está minimizando. */
  tiendas: number;
}

export function armarComanda(
  pedidos: Pedido[],
  sources: SourceListing[],
  storePriority?: Map<string, number>,
): Armado {
  // Por carta, su fuente más barata en cada tienda.
  const porCarta = new Map<number, Map<string, SourceListing>>();
  for (const s of sources) {
    const porTienda = porCarta.get(s.cardId) ?? new Map<string, SourceListing>();
    const previa = porTienda.get(s.storeSlug);
    if (!previa || s.priceCents < previa.priceCents) porTienda.set(s.storeSlug, s);
    porCarta.set(s.cardId, porTienda);
  }

  // La llave del plan es el ÍNDICE del pedido, no el id de la carta: la misma
  // carta puede venir dos veces en una lista pegada y las dos tienen que
  // sobrevivir hasta que se sumen por fuente.
  const lines: FulfillmentLine[] = pedidos.map((p, i) => {
    const porTienda = p.cardId == null ? null : porCarta.get(p.cardId);
    return {
      key: String(i),
      qty: p.qty,
      priceByStore: new Map(
        porTienda ? [...porTienda].map(([slug, s]) => [slug, s.priceCents]) : [],
      ),
    };
  });

  const plan = planFulfillment(lines, { storePriority });

  const picks: { source: SourceListing; qty: number }[] = [];
  for (const leg of plan.legs) {
    for (const key of leg.cardKeys) {
      const pedido = pedidos[Number(key)];
      const source = porCarta.get(pedido.cardId!)?.get(leg.storeSlug);
      if (source) picks.push({ source, qty: pedido.qty });
    }
  }

  return {
    picks,
    sinFuente: plan.uncovered.map((key) => pedidos[Number(key)]),
    tiendas: plan.legs.length,
  };
}

/**
 * Suma las cantidades de la misma fuente.
 *
 * Dos renglones de una lista pueden caer en el mismo listado —"Sol Ring" y
 * "sol ring" son la misma carta— y dos filas con la misma llave en un solo
 * `INSERT ... ON CONFLICT` truenan con "cannot affect row a second time".
 */
export function agruparPorFuente(
  picks: { source: SourceListing; qty: number }[],
): { source: SourceListing; qty: number }[] {
  const porFuente = new Map<number, { source: SourceListing; qty: number }>();
  for (const pick of picks) {
    const previo = porFuente.get(pick.source.listingId);
    if (previo) previo.qty += pick.qty;
    else porFuente.set(pick.source.listingId, { ...pick });
  }
  return [...porFuente.values()];
}

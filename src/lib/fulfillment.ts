/**
 * Con qué tiendas surtes una lista en el MENOR número de pedidos.
 *
 * El objetivo NO es el precio más bajo: es concentrar el pedido. Comprar cada
 * carta donde esté más barata suele significar seis pedidos, seis envíos y seis
 * esperas — peor para el jugador y peor para las tiendas, a las que además pone
 * a competir entre sí.
 *
 * Es un cubrimiento de conjuntos, que es NP-difícil, así que usamos la
 * heurística voraz clásica: en cada paso se toma la tienda que agrega más
 * cartas nuevas, y a igualdad de cartas, la más barata para ese tramo. Da un
 * resultado a lo mucho ln(n) veces peor que el óptimo, y para listas de 10–100
 * cartas es indistinguible del óptimo en la práctica.
 */

export interface FulfillmentLine {
  /** Identificador estable del renglón (índice o slug). */
  key: string;
  qty: number;
  /** Precio unitario más barato en cada tienda que la tiene con stock. */
  priceByStore: Map<string, number>;
}

export interface StoreLeg {
  storeSlug: string;
  /** Cartas distintas que ESTA tienda aporta al plan (no las que tiene). */
  cardKeys: string[];
  copies: number;
  subtotalCents: number;
}

export interface FulfillmentPlan {
  /** Tiendas en el orden en que las va agregando el plan. */
  legs: StoreLeg[];
  /** Cartas distintas cubiertas por el plan. */
  covered: number;
  /** Cartas distintas que nadie tiene. */
  uncovered: string[];
  totalCents: number;
}

export function planFulfillment(lines: FulfillmentLine[]): FulfillmentPlan {
  const pending = new Map(lines.filter((l) => l.priceByStore.size > 0).map((l) => [l.key, l]));
  const uncovered = lines.filter((l) => l.priceByStore.size === 0).map((l) => l.key);
  const legs: StoreLeg[] = [];

  while (pending.size > 0) {
    let best: StoreLeg | null = null;

    // Cada tienda candidata: cuántas cartas pendientes aporta y a qué costo.
    const candidates = new Set<string>();
    for (const line of pending.values()) {
      for (const slug of line.priceByStore.keys()) candidates.add(slug);
    }

    for (const slug of candidates) {
      const cardKeys: string[] = [];
      let copies = 0;
      let subtotalCents = 0;
      for (const line of pending.values()) {
        const price = line.priceByStore.get(slug);
        if (price == null) continue;
        cardKeys.push(line.key);
        copies += line.qty;
        subtotalCents += price * line.qty;
      }
      const leg: StoreLeg = { storeSlug: slug, cardKeys, copies, subtotalCents };
      const better =
        !best ||
        leg.cardKeys.length > best.cardKeys.length ||
        (leg.cardKeys.length === best.cardKeys.length && leg.subtotalCents < best.subtotalCents);
      if (better) best = leg;
    }

    if (!best || best.cardKeys.length === 0) break;
    legs.push(best);
    for (const key of best.cardKeys) pending.delete(key);
  }

  return {
    legs,
    covered: legs.reduce((n, leg) => n + leg.cardKeys.length, 0),
    uncovered: [...uncovered, ...pending.keys()],
    totalCents: legs.reduce((n, leg) => n + leg.subtotalCents, 0),
  };
}

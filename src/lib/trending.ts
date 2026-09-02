import { getCardsBySlugs, getTopCardsBySupply, type CardSummary } from "@/lib/db/queries";
import { getTopCardSlugs } from "@/lib/events/store";

/** De dónde salió el ranking que se está mostrando. */
export type TrendingSource = "demand" | "supply";

export interface Trending {
  cards: CardSummary[];
  source: TrendingSource;
}

/**
 * "Cartas de moda" = las más buscadas que además están disponibles.
 *
 * Primero intenta la demanda real (Postgres). Si no hay almacén configurado, o
 * todavía no hay tráfico, cae al único dato honesto que existe —en cuántas
 * tiendas está la carta— y lo declara en `source` para que la UI no finja
 * popularidad que no midió.
 */
export async function getTrending(limit = 5): Promise<Trending> {
  const slugs = await getTopCardSlugs(limit);
  const byDemand = getCardsBySlugs(slugs);
  if (byDemand.length) return { cards: byDemand, source: "demand" };
  return { cards: getTopCardsBySupply(limit), source: "supply" };
}

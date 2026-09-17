import type { Condition } from "@/lib/types";

/**
 * Qué hacer con cada listado que llegó del feed cuando la tienda ya capturó esa
 * misma carta a mano.
 *
 * La regla: lo capturado a mano NO se pisa nunca. Si el feed trae la misma
 * impresión en la misma condición que un listado manual de esa tienda, el
 * listado manual se queda publicado y el valor del feed se guarda como
 * advertencia para que la tienda decida cuál gana.
 *
 * Es una función pura sobre llaves para poder probarla sin base de datos: el
 * SQL de arriba sólo provee el conjunto de llaves manuales.
 */

/** Identidad de un listado dentro de una tienda: qué carta, en qué estado. */
export function listingKey(printingId: number, condition: string): string {
  return `${printingId}|${condition}`;
}

export interface FeedRow {
  printingId: number;
  condition: Condition;
  externalId: string;
}

export interface ManualListing {
  id: number;
  printingId: number;
  condition: string;
}

export interface Split<T extends FeedRow> {
  /** Entran a `listings` con normalidad. */
  aplicables: T[];
  /** Chocan con un listado manual: no entran, se levanta advertencia. */
  conflictos: Array<{ row: T; listingId: number }>;
}

export function splitFeedByConflicts<T extends FeedRow>(
  rows: T[],
  manual: ManualListing[],
): Split<T> {
  // Sin nada capturado a mano —el caso de hoy en todas las tiendas— esto es un
  // no-op y el feed entra tal cual.
  if (!manual.length) return { aplicables: rows, conflictos: [] };

  const porLlave = new Map(manual.map((m) => [listingKey(m.printingId, m.condition), m.id]));
  const aplicables: T[] = [];
  const conflictos: Array<{ row: T; listingId: number }> = [];

  for (const row of rows) {
    const listingId = porLlave.get(listingKey(row.printingId, row.condition));
    if (listingId == null) aplicables.push(row);
    else conflictos.push({ row, listingId });
  }
  return { aplicables, conflictos };
}

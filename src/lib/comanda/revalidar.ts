import type { ListingStatus, SourceListing } from "@/lib/db/queries";

/**
 * La revisión carta por carta ANTES de cobrar.
 *
 * No se aparta inventario —bloquear stock de una tienda por una comanda que
 * quizá no se pague sería quitarle ventas reales— así que alguien puede ganarte
 * una carta en el último segundo. La respuesta no es fallar: es rearmar y
 * ENSEÑAR el cambio, porque el precio y hasta el costo de recolección se mueven,
 * y cobrar algo distinto de lo que la persona aceptó es la manera más rápida de
 * perder su confianza.
 *
 * Puro a propósito: recibe el estado de hoy y devuelve qué cambió. Se prueba sin
 * base y sin Stripe.
 */

export type Cambio =
  /** Sigue igual. */
  | "igual"
  /** Misma fuente, otro precio. */
  | "precio"
  /** Misma fuente, ya no alcanza para todas las copias. */
  | "menos"
  /** Se acabó ahí; se encontró en otra tienda. */
  | "movida"
  /** Nadie la tiene. No se cobra y se va a la wishlist. */
  | "perdida";

export interface RenglonRevisado {
  lineId: number;
  cardId: number | null;
  cardName: string;
  cambio: Cambio;
  qtyAntes: number;
  qtyAhora: number;
  precioAntes: number;
  precioAhora: number;
  tiendaAntes: string | null;
  tiendaAhora: string | null;
  /** La fuente nueva, cuando cambió. */
  fuente: SourceListing | null;
}

export interface Revision {
  renglones: RenglonRevisado[];
  hayCambios: boolean;
  /** Lo que nadie tiene: no se cobra. */
  perdidas: RenglonRevisado[];
  subtotalAntes: number;
  subtotalAhora: number;
}

export interface RenglonParaRevisar {
  id: number;
  cardId: number | null;
  cardName: string;
  listingId: number | null;
  storeSlug: string | null;
  unitPriceCents: number;
  qty: number;
}

export function revalidar(
  lines: RenglonParaRevisar[],
  actuales: Map<number, ListingStatus>,
  alternativas: SourceListing[],
): Revision {
  // Las tiendas que ya están en la comanda. Rearmar DENTRO de ellas no agrega
  // una recolección más; irse a una tienda nueva sí, y eso encarece la entrega.
  const tiendasDelPedido = new Set(lines.map((l) => l.storeSlug).filter((s): s is string => !!s));

  const porCarta = new Map<number, SourceListing[]>();
  for (const a of alternativas) {
    porCarta.set(a.cardId, [...(porCarta.get(a.cardId) ?? []), a]);
  }

  const renglones = lines.map<RenglonRevisado>((l) => {
    const base = {
      lineId: l.id,
      cardId: l.cardId,
      cardName: l.cardName,
      qtyAntes: l.qty,
      precioAntes: l.unitPriceCents,
      tiendaAntes: l.storeSlug,
    };

    const actual = l.listingId == null ? undefined : actuales.get(l.listingId);

    if (actual && actual.inStock && actual.stock >= l.qty) {
      return {
        ...base,
        cambio: actual.priceCents === l.unitPriceCents ? "igual" : "precio",
        qtyAhora: l.qty,
        // Se adopta el precio de la tienda, nunca el nuestro: el precio es suyo.
        precioAhora: actual.priceCents,
        tiendaAhora: l.storeSlug,
        fuente: null,
      };
    }

    if (actual && actual.inStock && actual.stock > 0) {
      return {
        ...base,
        cambio: "menos",
        qtyAhora: actual.stock,
        precioAhora: actual.priceCents,
        tiendaAhora: l.storeSlug,
        fuente: null,
      };
    }

    // Se acabó. Se busca otra fuente, prefiriendo una tienda que YA está en el
    // pedido: mudar a una tienda nueva suma otra recolección, y concentrar es la
    // economía del mensajero.
    const candidatas = (l.cardId == null ? [] : (porCarta.get(l.cardId) ?? []))
      .filter((a) => a.listingId !== l.listingId && a.stock > 0)
      .sort((a, b) => {
        const ya = (s: SourceListing) => (tiendasDelPedido.has(s.storeSlug) ? 0 : 1);
        return ya(a) - ya(b) || a.priceCents - b.priceCents;
      });

    const nueva = candidatas[0];
    if (!nueva) {
      return {
        ...base,
        cambio: "perdida",
        qtyAhora: 0,
        precioAhora: l.unitPriceCents,
        tiendaAhora: null,
        fuente: null,
      };
    }

    return {
      ...base,
      cambio: "movida",
      qtyAhora: Math.min(l.qty, nueva.stock),
      precioAhora: nueva.priceCents,
      tiendaAhora: nueva.storeSlug,
      fuente: nueva,
    };
  });

  const subtotalAntes = lines.reduce((n, l) => n + l.unitPriceCents * l.qty, 0);
  const subtotalAhora = renglones.reduce((n, r) => n + r.precioAhora * r.qtyAhora, 0);

  return {
    renglones,
    hayCambios: renglones.some((r) => r.cambio !== "igual"),
    perdidas: renglones.filter((r) => r.cambio === "perdida"),
    subtotalAntes,
    subtotalAhora,
  };
}

export const ETIQUETA_CAMBIO: Record<Cambio, string> = {
  igual: "Sin cambios",
  precio: "Cambió de precio",
  menos: "Ya no alcanzan todas",
  movida: "Se consiguió en otra tienda",
  perdida: "Nadie la tiene: no se cobra",
};

/**
 * Una huella de lo que se le ENSEÑÓ al usuario.
 *
 * Entre que ve los cambios y aprieta "pagar" el mundo puede moverse otra vez. Sin
 * huella, ese segundo cambio se cobraría sin que nadie lo viera —justo lo que
 * esta revisión existe para evitar—. Si la huella no coincide, se vuelve a
 * enseñar y no se cobra.
 *
 * Es la forma de la comanda, no un secreto: no hay nada que firmar. Si alguien la
 * altera, lo único que consigue es que no coincida y se le enseñe de nuevo.
 */
export function huellaRevision(r: Revision): string {
  return r.renglones
    .map((x) => `${x.lineId}:${x.cambio}:${x.qtyAhora}:${x.precioAhora}:${x.tiendaAhora ?? "-"}`)
    .sort()
    .join("|");
}

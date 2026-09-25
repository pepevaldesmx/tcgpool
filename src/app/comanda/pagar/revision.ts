import { getOpenComanda, type Comanda } from "@/lib/db/comandas";
import { getListingsStatus, getSourceListings } from "@/lib/db/queries";
import { revalidar, type Revision } from "@/lib/comanda/revalidar";
import { desglosar, type Desglose } from "@/lib/comanda/money";

/**
 * La revisión de la comanda abierta, con el desglose de DESPUÉS.
 *
 * Vive aparte de la pantalla porque la corren dos: la vista, para enseñar los
 * cambios, y la acción, para comprobar que nada se movió entre que se enseñaron
 * y que el usuario aceptó. Si cada una armara la suya, podrían no coincidir por
 * una diferencia de código y no por una diferencia del mundo.
 */
export interface RevisionCompleta {
  comanda: Comanda;
  revision: Revision;
  /** Lo que se cobraría hoy. */
  desglose: Desglose;
  ciudadesOrigen: number;
}

export async function revisarComandaAbierta(userId: number): Promise<RevisionCompleta | null> {
  const comanda = await getOpenComanda(userId);
  if (!comanda || comanda.lines.length === 0) return null;

  const listingIds = comanda.lines
    .map((l) => l.listingId)
    .filter((id): id is number => id != null);
  const cardIds = [
    ...new Set(comanda.lines.map((l) => l.cardId).filter((id): id is number => id != null)),
  ];

  const [actuales, alternativas] = await Promise.all([
    getListingsStatus(listingIds),
    getSourceListings(cardIds),
  ]);

  const revision = revalidar(
    comanda.lines.map((l) => ({
      id: l.id,
      cardId: l.cardId,
      cardName: l.cardName,
      listingId: l.listingId,
      storeSlug: l.storeSlug,
      unitPriceCents: l.unitPriceCents,
      qty: l.qty,
    })),
    actuales,
    alternativas,
  );

  // Las ciudades de DESPUÉS: una carta que se mudó de tienda puede mudarse de
  // ciudad, y entonces el envío cuesta otra cosa. Cobrar el envío de antes sería
  // cobrar algo que ya no corresponde.
  const ciudadPorRenglon = new Map(comanda.lines.map((l) => [l.id, l.storeCity]));
  const ciudades = new Set(
    revision.renglones
      .filter((r) => r.qtyAhora > 0)
      .map((r) => r.fuente?.storeCity ?? ciudadPorRenglon.get(r.lineId) ?? "?"),
  );
  const ciudadesOrigen = Math.max(1, ciudades.size);

  return {
    comanda,
    revision,
    ciudadesOrigen,
    desglose: desglosar({
      subtotalCents: revision.subtotalAhora,
      entrega: comanda.delivery,
      ciudadesOrigen,
    }),
  };
}

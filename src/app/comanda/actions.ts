"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addLines,
  changeLineSource,
  ensureOpenComanda,
  getOpenComanda,
  removeLine,
  setDelivery,
  setLineQty,
} from "@/lib/db/comandas";
import { findCardsByNames, getSourceListing, getSourceListings } from "@/lib/db/queries";
import { armarComanda, type Pedido } from "@/lib/comanda/armar";
import { esEntrega } from "@/lib/comanda/money";
import { parseDecklist } from "@/lib/decklist";
import { getSesion } from "@/lib/auth/session";
import { getUserLocation } from "@/lib/location-server";
import { proximityRank } from "@/lib/location";

/**
 * Acciones de la comanda.
 *
 * Todas parten de la sesión y NUNCA de un id que venga del formulario: el
 * `comanda_id` se resuelve desde el usuario, y cada renglón se toca con
 * `WHERE comanda_id = ...` para que un id ajeno no encuentre nada. Mandar el id
 * de la comanda en el formulario dejaría editar el carrito de otra persona.
 */
async function comandaAbierta() {
  const sesion = await getSesion();
  if (!sesion) throw new Error("No autorizado");
  const comanda = await getOpenComanda(sesion.user.id);
  if (!comanda) throw new Error("No hay comanda abierta");
  return { comanda, userId: sesion.user.id };
}

/**
 * Arma una comanda desde una lista pegada.
 *
 * El plan elige EN QUÉ TIENDA y `armarComanda` cuál de sus listados; lo que no
 * se consigue se reporta para la wishlist. La cercanía sólo desempata: entre dos
 * tiendas que surten lo mismo gana la de tu ciudad, nunca a costa de cobertura.
 */
export async function armarDesdeLista(formData: FormData): Promise<void> {
  const sesion = await getSesion();
  const lista = String(formData.get("lista") ?? "");

  // Sin cuenta no hay a quién colgarle la comanda. Se manda a entrar y se
  // regresa a la misma lista, no al inicio: perder la lista pegada por haber
  // pedido una cuenta es como se abandona una compra.
  if (!sesion) {
    redirect(`/entrar?next=${encodeURIComponent(`/lista?lista=${encodeURIComponent(lista)}`)}`);
  }

  const deck = parseDecklist(lista);
  if (deck.length === 0) redirect("/lista");

  const catalogo = await findCardsByNames(deck.map((l) => l.name));
  const pedidos: Pedido[] = deck.map((l) => ({
    nombre: l.name,
    cardId: catalogo.get(l.name)?.id ?? null,
    qty: l.qty,
  }));

  const cardIds = pedidos.map((p) => p.cardId).filter((id): id is number => id != null);
  const sources = await getSourceListings(cardIds);

  const location = await getUserLocation();
  const prioridad = new Map<string, number>();
  for (const s of sources) {
    prioridad.set(
      s.storeSlug,
      proximityRank(location, { city: s.storeCity, lat: s.storeLat, lng: s.storeLng }),
    );
  }

  const armado = armarComanda(pedidos, sources, prioridad);

  const ciudad = armado.picks[0]?.source.storeCity ?? null;
  const comandaId = await ensureOpenComanda(sesion.user.id, ciudad);
  await addLines(comandaId, armado.picks);

  // Lo que nadie tiene se pasa por la URL y no se escribe todavía: la wishlist
  // es del usuario y se llena cuando él lo decide, no como efecto de una
  // búsqueda.
  const faltantes = armado.sinFuente.map((p) => p.nombre);
  const qs = faltantes.length ? `?faltan=${encodeURIComponent(faltantes.join("\n"))}` : "";
  redirect(`/comanda${qs}`);
}

/** Agregar una carta suelta, desde la vista de carta. */
export async function agregarFuente(formData: FormData): Promise<void> {
  const sesion = await getSesion();
  const volverA = String(formData.get("volverA") ?? "/comanda");
  if (!sesion) {
    redirect(`/entrar?next=${encodeURIComponent(volverA)}`);
  }

  const listingId = Number(formData.get("listingId"));
  if (!Number.isFinite(listingId)) redirect(volverA);

  // El precio y la tienda salen de la base, no del formulario: si vinieran del
  // formulario, cualquiera compraría una carta de mil pesos en uno.
  const source = await getSourceListing(listingId);
  if (!source) redirect(volverA);

  const qty = Math.max(1, Math.min(Number(formData.get("qty") ?? 1) || 1, source.stock || 1));
  const comandaId = await ensureOpenComanda(sesion.user.id, source.storeCity);
  await addLines(comandaId, [{ source, qty }]);
  redirect("/comanda");
}

export async function cambiarCantidad(formData: FormData): Promise<void> {
  const { comanda } = await comandaAbierta();
  const lineId = Number(formData.get("lineId"));
  const qty = Number(formData.get("qty"));
  if (Number.isFinite(lineId) && Number.isFinite(qty)) {
    await setLineQty(comanda.id, lineId, qty);
  }
  revalidatePath("/comanda");
}

export async function quitarRenglon(formData: FormData): Promise<void> {
  const { comanda } = await comandaAbierta();
  const lineId = Number(formData.get("lineId"));
  if (Number.isFinite(lineId)) await removeLine(comanda.id, lineId);
  revalidatePath("/comanda");
}

export async function cambiarFuente(formData: FormData): Promise<void> {
  const { comanda } = await comandaAbierta();
  const lineId = Number(formData.get("lineId"));
  const listingId = Number(formData.get("listingId"));
  if (!Number.isFinite(lineId) || !Number.isFinite(listingId)) return;

  const source = await getSourceListing(listingId);
  // Si la fuente que eligió ya se agotó entre que vio la lista y la eligió, no
  // se cambia nada: es mejor quedarse con la que sí existe que dejar el renglón
  // apuntando a algo que ya no se puede comprar.
  if (source) await changeLineSource(comanda.id, lineId, source);
  revalidatePath("/comanda");
}

export async function elegirEntrega(formData: FormData): Promise<void> {
  const { comanda } = await comandaAbierta();
  const entrega = String(formData.get("entrega") ?? "");
  if (!esEntrega(entrega)) return;

  const pickup = Number(formData.get("pickupStoreId"));
  await setDelivery(comanda.id, entrega, Number.isFinite(pickup) && pickup > 0 ? pickup : null);
  revalidatePath("/comanda");
}

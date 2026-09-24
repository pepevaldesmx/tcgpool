"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addToWishlist, removeFromWishlist } from "@/lib/db/wishlist";
import { findCardByName } from "@/lib/db/queries";
import { getSesion } from "@/lib/auth/session";

/**
 * Guardar cartas en la wishlist.
 *
 * Recibe NOMBRES y no ids porque quien llega aquí viene de una lista pegada: lo
 * que no se consiguió son los nombres que el usuario escribió. Los que el
 * catálogo no reconoce NO se inventan —se reportan— igual que en la importación
 * de inventario.
 */
export async function agregarAWishlist(formData: FormData): Promise<void> {
  const sesion = await getSesion();
  const volverA = String(formData.get("volverA") ?? "/wishlist");
  if (!sesion) {
    redirect(`/entrar?next=${encodeURIComponent(volverA)}`);
  }

  const nombres = String(formData.get("nombres") ?? "")
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 300);

  const cardIds: number[] = [];
  const desconocidos: string[] = [];
  for (const nombre of nombres) {
    const card = await findCardByName(nombre);
    if (card) cardIds.push(card.id);
    else desconocidos.push(nombre);
  }

  const source = formData.get("origen") === "comanda" ? "comanda" : "busqueda";
  await addToWishlist(sesion.user.id, cardIds, source);

  const qs = desconocidos.length
    ? `?desconocidos=${encodeURIComponent(desconocidos.join("\n"))}`
    : "";
  redirect(`/wishlist${qs}`);
}

export async function quitarDeWishlist(formData: FormData): Promise<void> {
  const sesion = await getSesion();
  if (!sesion) throw new Error("No autorizado");
  const itemId = Number(formData.get("itemId"));
  if (Number.isFinite(itemId)) await removeFromWishlist(sesion.user.id, itemId);
  revalidatePath("/wishlist");
}

"use server";

import { revalidatePath } from "next/cache";
import {
  deleteManualListing,
  getStoreByPanelToken,
  getStoreSellerId,
  resolveConflict,
  saveManualListing,
} from "@/lib/db/queries";
import type { Condition } from "@/lib/types";

/**
 * Acciones del panel de tienda.
 *
 * TODAS vuelven a validar el token contra la base y comparan el slug: el token
 * viaja en el formulario y es lo único que autoriza. Confiar en el slug de la
 * URL dejaría que cualquiera editara el inventario de otra tienda cambiando una
 * palabra en la dirección.
 */
async function authorize(formData: FormData): Promise<{ id: number; slug: string }> {
  const token = String(formData.get("token") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const store = await getStoreByPanelToken(token);
  if (!store || store.slug !== slug) throw new Error("No autorizado");
  return { id: store.id, slug: store.slug };
}

export async function resolveConflictAction(formData: FormData) {
  const store = await authorize(formData);
  const id = Number(formData.get("conflictId"));
  const resolution = formData.get("resolution") === "feed" ? "feed" : "manual";
  if (Number.isFinite(id)) await resolveConflict(id, store.id, resolution);
  revalidatePath(`/tienda/${store.slug}`);
}

export async function saveListingAction(formData: FormData) {
  const store = await authorize(formData);
  const sellerId = await getStoreSellerId(store.id);
  if (sellerId == null) throw new Error("La tienda no tiene vendedor espejo");

  const printingId = Number(formData.get("printingId"));
  // El precio se captura en pesos y se guarda en centavos: guardar pesos con
  // decimales en un entero es cómo se pierden los centavos.
  const pesos = Number(formData.get("pesos"));
  const stock = Number(formData.get("stock"));
  const condition = String(formData.get("condition") ?? "NM") as Condition;
  const cardName = String(formData.get("cardName") ?? "");

  if (!Number.isFinite(printingId) || !Number.isFinite(pesos) || pesos <= 0) return;
  if (!Number.isFinite(stock) || stock < 0) return;

  await saveManualListing({
    storeId: store.id,
    sellerId,
    printingId,
    priceCents: Math.round(pesos * 100),
    condition,
    stock: Math.floor(stock),
    productUrl: "",
    rawTitle: cardName,
  });
  revalidatePath(`/tienda/${store.slug}`);
}

export async function deleteListingAction(formData: FormData) {
  const store = await authorize(formData);
  const id = Number(formData.get("listingId"));
  if (Number.isFinite(id)) await deleteManualListing(id, store.id);
  revalidatePath(`/tienda/${store.slug}`);
}

"use server";

import { revalidatePath } from "next/cache";
import {
  deleteManualListing,
  getStoreByPanelToken,
  getStoreSellerId,
  importManualListings,
  loadCardIndex,
  resolveConflict,
  saveManualListing,
} from "@/lib/db/queries";
import { leerInventarioCsv, MAX_FILAS } from "@/lib/ingest/csv-import";
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

export interface ResumenImportacion {
  ok: boolean;
  mensaje: string;
  total: number;
  reconocidas: number;
  guardadas: number;
  suplantadas: number;
  descartadas: number;
  desconocidos: Array<{ nombre: string; veces: number }>;
  /** true = sólo se leyó el archivo; no se escribió nada. */
  ensayo: boolean;
}

/**
 * Lee el inventario de un archivo CSV y, si no es ensayo, lo guarda.
 *
 * Siempre se puede correr en ENSAYO: la tienda ve qué entendimos —cuántas
 * reconocimos, cuáles no— antes de que toquemos su inventario. Importar a
 * ciegas un archivo de mil renglones y avisar después es como se pierde la
 * confianza de una tienda en un solo movimiento.
 */
export async function importCsvAction(formData: FormData): Promise<ResumenImportacion> {
  const vacio = {
    total: 0,
    reconocidas: 0,
    guardadas: 0,
    suplantadas: 0,
    descartadas: 0,
    desconocidos: [],
  };
  const ensayo = formData.get("ensayo") === "1";

  let store: { id: number; slug: string };
  try {
    store = await authorize(formData);
  } catch {
    return { ok: false, mensaje: "No autorizado.", ensayo, ...vacio };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, mensaje: "No llegó ningún archivo.", ensayo, ...vacio };
  }
  // 8 MB es holgado para 3,000 renglones de texto y corta un archivo enorme
  // antes de leerlo a memoria.
  if (archivo.size > 8 * 1024 * 1024) {
    return { ok: false, mensaje: "El archivo pesa más de 8 MB.", ensayo, ...vacio };
  }

  const texto = await archivo.text();
  const catalogo = await loadCardIndex("magic");
  const lectura = leerInventarioCsv(texto, catalogo);
  if (lectura.error) {
    return { ok: false, mensaje: lectura.error, ensayo, ...vacio, total: lectura.total };
  }

  const comun = {
    total: lectura.total,
    reconocidas: lectura.filas.length,
    descartadas: lectura.descartados,
    desconocidos: lectura.desconocidos.slice(0, 25),
    suplantadas: 0,
    guardadas: 0,
  };

  if (ensayo) {
    return {
      ok: true,
      ensayo: true,
      mensaje:
        lectura.total > MAX_FILAS
          ? `Leímos los primeros ${MAX_FILAS} renglones de ${lectura.total}.`
          : "Así quedaría.",
      ...comun,
    };
  }

  const sellerId = await getStoreSellerId(store.id);
  if (sellerId == null) {
    return { ok: false, mensaje: "La tienda no tiene vendedor espejo.", ensayo, ...comun };
  }

  const { guardados, suplantados } = await importManualListings(store.id, sellerId, lectura.filas);
  revalidatePath(`/tienda/${store.slug}`);
  return {
    ok: true,
    ensayo: false,
    mensaje: "Inventario importado.",
    ...comun,
    guardadas: guardados,
    suplantadas: suplantados,
  };
}

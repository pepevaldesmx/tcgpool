import { NextResponse } from "next/server";
import { getPrintingForPricing } from "@/lib/db/queries";
import { referencePrice } from "@/lib/cards/price";

export const dynamic = "force-dynamic";

/**
 * Precio de referencia e imagen de una impresión, para el panel de captura.
 *
 * Devuelve datos públicos de catálogo —la imagen y el precio de TCGplayer que
 * Scryfall republica—, nunca inventario de nadie, así que no pide token.
 */
export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("printingId"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "printingId" }, { status: 400 });

  const printing = await getPrintingForPricing(id);
  if (!printing) return NextResponse.json({ error: "no existe" }, { status: 404 });

  return NextResponse.json(await referencePrice(printing));
}

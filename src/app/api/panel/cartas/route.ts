import { NextResponse } from "next/server";
import { listPrintingsForCard, searchCards } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * Buscador de cartas del panel: nombre -> cartas con sus impresiones.
 *
 * A diferencia del buscador público, aquí NO se filtra por stock ni por
 * "alguien ya la vende": la tienda captura justamente lo que nadie tiene
 * publicado, así que esconder eso escondería lo que quiere capturar.
 *
 * Devuelve sólo catálogo —nombres, sets, idiomas—, nunca inventario ni precios
 * de nadie, así que no necesita el token del panel.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const cards = (await searchCards(q, { limit: 6, onlyInStock: false, includeUnlisted: true })).slice(0, 6);
  const results = await Promise.all(
    cards.map(async (c) => ({
      id: c.id,
      name: c.name,
      printings: await listPrintingsForCard(c.id),
    })),
  );

  return NextResponse.json({ results });
}

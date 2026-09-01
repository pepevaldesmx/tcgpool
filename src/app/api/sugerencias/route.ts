import { NextResponse } from "next/server";
import { searchCards } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/** Autocomplete del buscador. Devuelve como máximo 8 cartas. */
export function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const results = searchCards(q, { limit: 8 }).map((c) => ({
    name: c.name,
    slug: c.slug,
    imageUrl: c.imageUrl,
    storeCount: c.storeCount,
    inStockCount: c.inStockCount,
    minPriceCents: c.minPriceCents,
  }));

  return NextResponse.json({ results });
}

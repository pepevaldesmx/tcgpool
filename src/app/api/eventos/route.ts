import { NextResponse } from "next/server";
import { cardExists } from "@/lib/db/queries";
import { recordEvent, type EventKind } from "@/lib/events/store";

export const dynamic = "force-dynamic";

const KINDS: EventKind[] = ["view", "clickout"];

/**
 * Registra una señal de demanda. El cliente la manda al ver una carta y al
 * salir hacia la tienda.
 *
 * Sólo acepta slugs que existen en el catálogo: sin esa guarda cualquiera
 * podría llenar la tabla de basura y ensuciar el ranking.
 */
export async function POST(request: Request) {
  let body: { slug?: string; kind?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug.slice(0, 120) : "";
  const kind = body.kind as EventKind;

  if (!slug || !KINDS.includes(kind) || !cardExists(slug)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await recordEvent(slug, kind);
  return NextResponse.json({ ok: true });
}

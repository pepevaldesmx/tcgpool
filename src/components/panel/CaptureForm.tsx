"use client";

import { useState } from "react";
import { saveListingAction } from "@/app/tienda/[slug]/actions";
import { CONDITION_ORDER, conditionLabel } from "@/lib/format";

interface Printing {
  id: number;
  setName: string | null;
  collectorNumber: string | null;
  language: string;
  finish: string;
}
interface Card {
  id: number;
  name: string;
  printings: Printing[];
}

function printingLabel(p: Printing): string {
  return (
    [p.setName ?? "Sin set", p.collectorNumber, p.language, p.finish === "foil" ? "foil" : null]
      .filter(Boolean)
      .join(" · ")
  );
}

/**
 * Capturar una carta a mano.
 *
 * Se elige una IMPRESIÓN concreta, no una carta: el mismo "Sol Ring" en dos
 * sets, idiomas o acabados son cosas distintas con precios distintos, y
 * colapsarlos rompería la comparación entre tiendas.
 */
export default function CaptureForm({ token, slug }: { token: string; slug: string }) {
  const [q, setQ] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [picked, setPicked] = useState<{ card: Card; printing: Printing } | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBuscando(true);
    try {
      const res = await fetch(`/api/panel/cartas?q=${encodeURIComponent(q)}`);
      const body = (await res.json()) as { results: Card[] };
      setCards(body.results);
      setPicked(null);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="mt-4 rounded-card border border-line bg-surface p-5 shadow-card">
      <form onSubmit={buscar} className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre de la carta"
          className="min-w-[240px] flex-1 rounded-control border border-line bg-paper px-3 py-2 text-[15px]"
        />
        <button
          type="submit"
          disabled={buscando}
          className="rounded-pill border border-line bg-surface px-5 py-2 text-[14px] font-semibold text-muted shadow-card transition hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {buscando ? "Buscando…" : "Buscar versiones"}
        </button>
      </form>

      {cards.length > 0 && !picked && (
        <div className="mt-4 space-y-3">
          {cards.map((card) => (
            <div key={card.id}>
              <p className="text-[15px] font-semibold">{card.name}</p>
              {card.printings.length === 0 ? (
                <p className="mt-1 text-[13px] text-muted">
                  No conocemos ninguna versión de esta carta todavía.
                </p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-2">
                  {card.printings.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setPicked({ card, printing: p })}
                        className="rounded-pill border border-line bg-paper px-3 py-1 text-[13px] text-muted transition hover:border-accent hover:text-accent"
                      >
                        {printingLabel(p)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {picked && (
        <form action={saveListingAction} className="mt-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="printingId" value={picked.printing.id} />
          <input type="hidden" name="cardName" value={picked.card.name} />

          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft pb-2">
            <p className="text-[17px] font-semibold">{picked.card.name}</p>
            <p className="text-[13px] text-muted">{printingLabel(picked.printing)}</p>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-[13px] text-muted">
              Precio (MXN)
              <input
                name="pesos"
                type="number"
                min="1"
                step="0.01"
                required
                className="mt-1 block w-32 rounded-control border border-line bg-paper px-3 py-2 text-[15px] text-ink tnum"
              />
            </label>
            <label className="text-[13px] text-muted">
              Estado
              <select
                name="condition"
                defaultValue="NM"
                className="mt-1 block rounded-control border border-line bg-paper px-3 py-2 text-[15px] text-ink"
              >
                {CONDITION_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {conditionLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[13px] text-muted">
              Cantidad
              <input
                name="stock"
                type="number"
                min="0"
                step="1"
                defaultValue={1}
                required
                className="mt-1 block w-24 rounded-control border border-line bg-paper px-3 py-2 text-[15px] text-ink tnum"
              />
            </label>
            <button
              type="submit"
              className="rounded-pill border border-accent bg-accent px-5 py-2 text-[14px] font-semibold text-accent-ink shadow-card"
            >
              Publicar
            </button>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-[13px] font-semibold text-muted hover:text-accent"
            >
              Cambiar versión
            </button>
          </div>
          {/* Cantidad 0 es cómo se marca agotado sin borrar el listado: la carta
              sigue siendo tuya y el comprador sabe a quién preguntarle. */}
          <p className="mt-2 text-[13px] text-muted">
            Cantidad 0 la marca agotada sin darla de baja.
          </p>
        </form>
      )}
    </div>
  );
}

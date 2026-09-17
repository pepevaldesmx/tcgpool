"use client";

import { useEffect, useState } from "react";
import { saveListingAction } from "@/app/tienda/[slug]/actions";
import { CONDITION_ORDER, conditionLabel } from "@/lib/format";

interface Printing {
  id: number;
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  language: string;
  finish: string;
  imageUrl: string | null;
}

interface Reference {
  usd: number | null;
  suggestedCents: number | null;
  rate: number;
  rateSource: "vivo" | "configurado" | "respaldo";
  rateAsOf: string | null;
  imageUrl: string | null;
  scryfallUrl: string | null;
  match: "exacta" | "por-set" | "por-nombre" | "ninguna";
}

const MATCH_AVISO: Record<Reference["match"], string | null> = {
  exacta: null,
  "por-set": "Precio de esta edición, sin confirmar el número de colección.",
  "por-nombre": "Precio de OTRA edición de la misma carta: puede no parecerse.",
  ninguna: null,
};
interface Card {
  id: number;
  name: string;
  printings: Printing[];
}

function printingLabel(p: Printing): string {
  return (
    [
      p.setName ?? "Sin set",
      p.collectorNumber ? `#${p.collectorNumber}` : null,
      p.language,
      p.finish === "foil" ? "foil" : p.finish === "etched" ? "etched" : null,
    ]
      .filter(Boolean)
      .join(" · ")
  );
}

/**
 * Una impresión de la cuadrícula.
 *
 * Con imagen, porque el set y el número se leen mal y la ilustración no: entre
 * ocho "Command Tower" de ocho ediciones, la única forma rápida de reconocer la
 * que tienes en la mano es verla.
 */
function PrintingCard({ p, onPick }: { p: Printing; onPick: () => void }) {
  const [rota, setRota] = useState(false);
  return (
    <button
      type="button"
      onClick={onPick}
      // El nombre del set se corta a dos renglones en 128px; el título completo
      // queda en el tooltip para no ensanchar la cuadrícula.
      title={printingLabel(p)}
      className="group flex w-[128px] shrink-0 flex-col overflow-hidden rounded-card border border-line bg-paper text-left shadow-card transition hover:border-accent hover:shadow-lift"
    >
      <div className="flex h-[124px] w-full items-center justify-center overflow-hidden bg-surface-2">
        {p.imageUrl && !rota ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.imageUrl}
            alt=""
            onError={() => setRota(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[11px] text-muted">sin imagen</span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-ink group-hover:text-accent">
          {p.setName ?? "Sin set"}
        </p>
        <p className="mt-0.5 text-[11px] text-muted tnum">
          {p.collectorNumber ? `#${p.collectorNumber}` : "sin número"} · {p.language}
          {p.finish !== "nonfoil" ? ` · ${p.finish}` : ""}
        </p>
      </div>
    </button>
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
  const [ref, setRef] = useState<Reference | null>(null);
  const [precio, setPrecio] = useState("");
  const [imagenRota, setImagenRota] = useState(false);
  // Pesos por dólar con el que la tienda quiere calcular. Arranca en el tipo de
  // cambio de hoy y se mueve de diez en diez centavos: es el mismo ajuste que
  // la tienda ya hace de cabeza para cubrir importación y margen.
  const [tipoCambio, setTipoCambio] = useState<number | null>(null);

  // La referencia se pide al elegir la versión, no al buscar: pedirla para
  // todas las impresiones de seis cartas serían decenas de llamadas que casi
  // nadie va a mirar.
  const printingId = picked?.printing.id;
  useEffect(() => {
    setImagenRota(false);
    if (printingId == null) {
      setRef(null);
      return;
    }
    let vivo = true;
    setRef(null);
    fetch(`/api/panel/precio?printingId=${printingId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: Reference | null) => {
        if (!vivo) return;
        setRef(body);
        // El tipo de cambio que la tienda haya ajustado se respeta entre
        // cartas: quien subió a 26 para la primera no quiere volver a subirlo
        // en cada captura.
        setTipoCambio((previo) => previo ?? body?.rate ?? null);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [printingId]);

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

  const sugerido = (ref?.usd ?? 0) * (tipoCambio ?? ref?.rate ?? 0);

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
                // En scroll horizontal: una carta con veinte impresiones no
                // debe empujar el formulario fuera de la pantalla.
                <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
                  {card.printings.map((p) => (
                    <PrintingCard
                      key={p.id}
                      p={p}
                      onPick={() => {
                        setPicked({ card, printing: p });
                        setPrecio("");
                      }}
                    />
                  ))}
                </div>
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

          <div className="flex gap-4 border-b border-line-soft pb-3">
            {/* La imagen es la verificación más rápida de que se eligió la
                versión correcta: el set y el número se leen mal, la ilustración
                no. */}
            {(ref?.imageUrl ?? picked.printing.imageUrl) && !imagenRota && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={(ref?.imageUrl ?? picked.printing.imageUrl) as string}
                alt={picked.card.name}
                // Una liga de imagen rota deja el ícono gris de "no cargó", que
                // en un panel se lee como "algo se descompuso". Mejor nada.
                onError={() => setImagenRota(true)}
                className="h-[112px] w-[80px] shrink-0 rounded-control border border-line object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold">{picked.card.name}</p>
              <p className="text-[13px] text-muted">{printingLabel(picked.printing)}</p>

              {ref?.usd != null ? (
                <div className="mt-2">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[13px] text-muted">
                    <span>Referencia TCGplayer</span>
                    <span className="font-semibold text-ink tnum">US${ref.usd.toFixed(2)}</span>
                    <span>×</span>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="99"
                      value={tipoCambio ?? ref.rate}
                      onChange={(e) => setTipoCambio(Number(e.target.value))}
                      className="w-[84px] rounded-control border border-line bg-paper px-2 py-1 text-[13px] font-semibold text-ink tnum"
                      aria-label="Pesos por dólar"
                    />
                    <span>=</span>
                    <span className="font-semibold text-ink tnum">${sugerido.toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => setPrecio(sugerido.toFixed(2))}
                      className="rounded-pill border border-line bg-paper px-3 py-1 text-[13px] font-semibold text-muted transition hover:border-accent hover:text-accent"
                    >
                      Usar este precio
                    </button>
                  </div>
                  <p className="mt-1.5 text-[12px] text-muted">
                    {ref.rateSource === "vivo"
                      ? `Tipo de cambio del ${ref.rateAsOf}. Muévelo para cubrir importación y margen.`
                      : ref.rateSource === "configurado"
                        ? "Tipo de cambio configurado a mano, no el del día."
                        : "No pudimos consultar el tipo de cambio de hoy: éste es un respaldo."}
                  </p>
                  {MATCH_AVISO[ref.match] && (
                    <p className="mt-1.5 text-[12px] text-warn">{MATCH_AVISO[ref.match]}</p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-muted">
                  {ref === null
                    ? "Buscando precio de referencia…"
                    : "Sin precio de referencia para esta versión."}
                </p>
              )}
            </div>
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
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
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

import Link from "next/link";
import type { CardSummary } from "@/lib/db/queries";
import { conditionLabel, money } from "@/lib/format";

/** Mientras no hay ilustración: mantiene la proporción para que nada salte. */
const SIN_IMAGEN = "/carta-placeholder.svg";

export default function CardTile({ card }: { card: CardSummary }) {
  const available = card.inStockCount > 0;
  // Las copias, no los listados: al comprador le importa cuántas puede llevarse.
  const copias = card.copiesInStock || card.inStockCount;

  return (
    <Link
      href={`/carta/${card.slug}`}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lift"
    >
      <div className="aspect-[63/88] overflow-hidden bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.imageUrl ?? SIN_IMAGEN}
          alt={card.name}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>

      <div className="flex flex-1 flex-col gap-1 border-t border-line-soft px-4 py-3.5">
        <h3 className="truncate text-[15px] font-semibold" title={card.name}>
          {card.name}
        </h3>
        {available ? (
          <>
            {/* Primero la disponibilidad y luego el precio: el problema real
                siempre fue quién la tiene, y premiar el precio pondría a las
                tiendas a competir entre ellas. */}
            <p className="text-[13px] font-semibold text-ink tnum">
              {copias} en stock{" "}
              <span className="font-medium text-muted">
                ({card.storeCount} {card.storeCount === 1 ? "tienda" : "tiendas"})
              </span>
            </p>
            <p className="text-[13px] text-muted tnum">
              desde {money(card.minPriceCents)}
              {card.cheapestCondition && (
                // Sin la condición, "desde $39" deja creer que esa copia está
                // sana; puede ser la más maltratada.
                <span className="text-[12px]"> ({conditionLabel(card.cheapestCondition)})</span>
              )}
            </p>
          </>
        ) : (
          <p className="text-[13px] font-semibold text-muted">Sin stock ahora</p>
        )}
      </div>
    </Link>
  );
}

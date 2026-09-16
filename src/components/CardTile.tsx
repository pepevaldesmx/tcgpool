import Link from "next/link";
import type { CardSummary } from "@/lib/db/queries";
import { money } from "@/lib/format";

export default function CardTile({ card }: { card: CardSummary }) {
  const available = card.inStockCount > 0;

  return (
    <Link
      href={`/carta/${card.slug}`}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lift"
    >
      <div className="relative aspect-[63/88] overflow-hidden bg-surface-2">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt={card.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center px-3 text-center text-xs text-muted">
            {card.name}
          </div>
        )}
        {card.storeCount > 1 && (
          <span className="absolute left-2.5 top-2.5 rounded-pill bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-ink">
            {card.storeCount} tiendas
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 border-t border-line-soft px-4 py-3.5">
        <h3 className="truncate text-[15px] font-semibold" title={card.name}>
          {card.name}
        </h3>
        <p className="mt-auto pt-1 text-xs text-muted">
          {available ? (
            <>
              desde{" "}
              <span className="text-lg font-bold text-ink tnum">
                {money(card.minPriceCents)}
              </span>
            </>
          ) : (
            "sin stock ahora"
          )}
        </p>
        <p className="text-[11px] text-muted">
          {card.listingCount} {card.listingCount === 1 ? "listado" : "listados"}
        </p>
      </div>
    </Link>
  );
}

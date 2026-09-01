import Link from "next/link";
import type { CardSummary } from "@/lib/db/queries";
import { money } from "@/lib/format";

export default function CardTile({ card }: { card: CardSummary }) {
  const available = card.inStockCount > 0;

  return (
    <Link
      href={`/carta/${card.slug}`}
      className="group flex flex-col overflow-hidden rounded border border-line bg-surface transition hover:border-accent"
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
          <span className="absolute left-2 top-2 rounded-sm bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
            {card.storeCount} tiendas
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 border-t border-line-soft p-3">
        <h3 className="truncate font-serif text-[15px] font-semibold" title={card.name}>
          {card.name}
        </h3>
        <p className="mt-auto pt-1 text-xs text-muted">
          {available ? (
            <>
              desde{" "}
              <span className="font-mono text-base font-bold text-ink tnum">
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

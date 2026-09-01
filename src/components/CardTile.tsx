import Link from "next/link";
import type { CardSummary } from "@/lib/db/queries";
import { money } from "@/lib/format";

export default function CardTile({ card }: { card: CardSummary }) {
  const available = card.inStockCount > 0;

  return (
    <Link
      href={`/carta/${card.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60 transition hover:-translate-y-0.5 hover:border-brand-600/70 hover:bg-ink-850"
    >
      <div className="relative aspect-[63/88] overflow-hidden bg-ink-850">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt={card.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center px-3 text-center text-xs text-ink-500">
            {card.name}
          </div>
        )}
        {card.storeCount > 1 && (
          <span className="absolute left-2 top-2 rounded-full bg-ink-950/85 px-2 py-1 text-[11px] font-semibold text-brand-400 ring-1 ring-brand-600/40">
            {card.storeCount} tiendas
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="truncate text-sm font-semibold" title={card.name}>
          {card.name}
        </h3>
        <p className="mt-auto text-xs text-ink-500">
          {available ? (
            <>
              desde{" "}
              <span className="text-base font-bold text-brand-400">
                {money(card.minPriceCents)}
              </span>
            </>
          ) : (
            "sin stock ahora"
          )}
        </p>
        <p className="text-[11px] text-ink-500">
          {card.listingCount} {card.listingCount === 1 ? "listado" : "listados"}
        </p>
      </div>
    </Link>
  );
}

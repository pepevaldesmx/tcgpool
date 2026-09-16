import Link from "next/link";
import type { StorePublic } from "@/lib/db/queries";
import { formatDistance, proximityRank, type UserLocation } from "@/lib/location";

/**
 * Tiendas ordenadas por inventario, o por cercanía si el usuario ya dijo dónde
 * está. La ubicación viene del selector de la barra —una sola fuente para toda
 * la app— en vez de que esta lista pida el permiso por su cuenta.
 */
export default function StoreList({
  stores,
  location,
}: {
  stores: StorePublic[];
  location: UserLocation | null;
}) {
  const ranked = stores.map((store) => ({
    store,
    rank: proximityRank(location, store),
  }));
  const sorted = location
    ? [...ranked].sort((a, b) => a.rank - b.rank || b.store.inStockCount - a.store.inStockCount)
    : ranked;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] text-muted">
          {location
            ? `Ordenadas por cercanía a ${location.city ?? "tu ubicación"}.`
            : "Ordenadas por inventario disponible (tienda + afiliados)."}
        </p>
        {!location && (
          <span className="text-[13px] text-muted">
            Elige tu ciudad arriba para ordenarlas por cercanía.
          </span>
        )}
      </div>

      <ul className="mt-4 divide-y divide-line-soft overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {sorted.map(({ store, rank }) => (
          <li key={store.id}>
            <a
              href={store.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 px-5 py-4 transition hover:bg-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{store.name}</span>
                <span className="block text-xs text-muted">
                  {store.city ?? "México"}
                  {location && rank === 0 && <span className="text-ok"> · en tu ciudad</span>}
                  {location && rank > 0 && rank < Number.MAX_SAFE_INTEGER && (
                    <> · a {formatDistance(rank)}</>
                  )}
                  {store.affiliateCount > 0 && ` · ${store.affiliateCount} afiliados`}
                </span>
              </span>
              <span className="whitespace-nowrap text-right">
                <span className="block text-lg font-bold tnum">
                  {store.inStockCount.toLocaleString("es-MX")}
                </span>
                <span className="block text-[11px] text-muted">cartas con stock</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      {location && (
        <p className="mt-2 text-xs text-muted">
          La distancia es al centro de la ciudad de cada tienda, no a su dirección
          exacta.
        </p>
      )}
    </div>
  );
}

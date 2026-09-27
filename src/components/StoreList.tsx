import Link from "next/link";
import type { StorePublic } from "@/lib/db/queries";
import { formatDistance, proximityRank, type UserLocation } from "@/lib/location";

/** Mientras la tienda no manda foto. Abstracto: nunca finge una fachada. */
const SIN_FOTO = "/tiendas/placeholder.webp";

/**
 * El directorio de tiendas, como tarjetas con la foto de fondo.
 *
 * Se ordenan por cercanía si el usuario ya dijo dónde está, y si no, por
 * inventario disponible. La ubicación viene del selector —una sola fuente para
 * toda la app— en vez de que esta lista pida el permiso por su cuenta.
 */
export default function StoreList({
  stores,
  location,
}: {
  stores: StorePublic[];
  location: UserLocation | null;
}) {
  const ranked = stores.map((store) => ({ store, rank: proximityRank(location, store) }));
  const sorted = location
    ? [...ranked].sort((a, b) => a.rank - b.rank || b.store.inStockCount - a.store.inStockCount)
    : ranked;

  return (
    <div>
      <p className="text-[15px] text-muted">
        {location
          ? `Ordenadas por cercanía a ${location.city ?? "tu ubicación"}.`
          : "Ordenadas por inventario disponible (tienda + afiliados)."}
      </p>

      <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map(({ store, rank }) => (
          <li key={store.id}>
            <Link
              href={`/tiendas#${store.slug}`}
              id={store.slug}
              className="group relative flex aspect-[16/10] flex-col justify-end overflow-hidden rounded-card shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={store.imageUrl ?? SIN_FOTO}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              />
              {/* El degradado inferior es lo que hace legible el texto encima de
                  cualquier foto que mande la tienda, sin pedirle que la tome de
                  cierta manera. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-scrim via-scrim/60 to-transparent"
              />

              {store.dataSource !== "live" && (
                <span className="absolute right-3 top-3 rounded-pill border border-warn-line bg-warn-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn">
                  demo
                </span>
              )}

              <div className="relative p-4">
                <p className="sobre-foto text-[17px] font-bold text-night-ink">{store.name}</p>
                <p className="sobre-foto mt-0.5 text-[13px] text-night-muted">
                  {store.city ?? "México"}
                  {location && rank === 0 && (
                    <span className="font-semibold text-accent-night"> · en tu ciudad</span>
                  )}
                  {location && rank > 0 && rank < Number.MAX_SAFE_INTEGER && (
                    <> · a {formatDistance(rank)}</>
                  )}
                </p>
                <p className="sobre-foto mt-1.5 text-[14px] font-semibold text-night-ink tnum">
                  {store.inStockCount.toLocaleString("es-MX")} cartas en stock
                  {store.affiliateCount > 0 && (
                    <span className="font-medium text-night-muted">
                      {" "}
                      · {store.affiliateCount}{" "}
                      {store.affiliateCount === 1 ? "afiliado" : "afiliados"}
                    </span>
                  )}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

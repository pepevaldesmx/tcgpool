import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import CardTile from "@/components/CardTile";
import SampleDataNotice from "@/components/SampleDataNotice";
import { getMultiStoreCards, getStats, isSampleData, listStoresPublic } from "@/lib/db/queries";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const SUGGESTED = ["Sol Ring", "Lightning Bolt", "Rhystic Study", "Cyclonic Rift"];

export default function HomePage() {
  const stats = getStats();
  const stores = listStoresPublic();
  const featured = getMultiStoreCards(10);
  const sample = isSampleData();

  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <section className="border-b border-line py-12 sm:py-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
          {stats.stores} tiendas mexicanas en un solo buscador
        </p>
        <h1 className="max-w-3xl font-serif text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
          Encuentra tu carta sin ir tienda por tienda.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
          El stock de una sola tienda casi nunca alcanza. TCG Pool junta el
          catálogo de varias tiendas mexicanas y te dice, en una vista, quién
          tiene la carta, en qué versión y condición, y a qué precio.
        </p>

        <div className="mt-7 max-w-2xl">
          <SearchBox size="lg" />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Prueba:</span>
            {SUGGESTED.map((name) => (
              <Link
                key={name}
                href={`/buscar?q=${encodeURIComponent(name)}`}
                className="rounded-sm border border-line bg-surface px-2.5 py-1 text-ink transition hover:border-accent hover:text-accent"
              >
                {name}
              </Link>
            ))}
          </div>
        </div>

        <dl className="mt-9 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-4">
          {[
            ["Tiendas", stats.stores],
            ["Cartas", stats.cards],
            ["Listados", stats.listings],
            ["Con stock", stats.inStock],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface px-4 py-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-mono text-2xl font-bold tracking-tight tnum">
                {Number(value).toLocaleString("es-MX")}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-xs text-muted">
          Última sincronización: {timeAgo(stats.lastSyncedAt)}
        </p>

        {sample && (
          <div className="mt-6 max-w-3xl">
            <SampleDataNotice />
          </div>
        )}
      </section>

      {featured.length > 0 && (
        <section className="border-b border-line py-10">
          <h2 className="font-serif text-xl font-semibold tracking-tight">
            Repartidas entre varias tiendas
          </h2>
          <p className="mt-1 text-sm text-muted">
            Justo lo que no puedes ver desde el buscador de una sola tienda.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {featured.slice(0, 5).map((card) => (
              <CardTile key={card.id} card={card} />
            ))}
          </div>
        </section>
      )}

      <section className="py-10">
        <h2 className="font-serif text-xl font-semibold tracking-tight">
          Tiendas conectadas
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stores.map((store) => (
            <Link
              key={store.id}
              href="/tiendas"
              className="rounded border border-line bg-surface p-4 transition hover:border-accent"
            >
              <p className="font-serif text-[15px] font-semibold">{store.name}</p>
              <p className="text-xs text-muted">{store.city ?? "México"}</p>
              <p className="mt-3 text-xs text-muted">
                <span className="font-mono font-bold text-ink tnum">
                  {store.inStockCount.toLocaleString("es-MX")}
                </span>{" "}
                listados con stock
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
